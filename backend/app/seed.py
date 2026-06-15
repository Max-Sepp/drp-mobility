import json
from pathlib import Path

from sqlalchemy.orm import Session

from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.line import Line
from app.models.platform import Platform, PlatformStepFree
from app.models.station import Station
from app.models.user import UserRole
from app.repositories.user import UserRepository

# Reference data inserted on every startup. Idempotent (skips rows that already exist),
# so editing the dataset adds new entries to existing databases but never removes or renames.
#
# Station data lives in data/stations.json. All 387 stations across all TfL modes are
# enriched from the TfL step-free access CSV feed (run temp/enrich_tube_stations.py to
# refresh). The seed handles both enriched and legacy formats.
#
# A station's step-free access is not stored: it is derived from its platforms
# (see Station.step_free), each of which carries its own `stepFreeAccess`.
#
# Enriched entry fields:
#   name, escalators, platforms: [{ name, lines: [...], stepFreeAccess, ... }],
#   lift_units: [{ name, from, to, limitedCapacity, ... }],
#   escalator_units: [{ name, from, to, mocked: true }]  ← synthetic, no TfL topology source
#
# Legacy fallbacks (non-enriched / unmatched stations):
#   platforms: [{ name, lines: "Line1, Line2" }]
#   lift_units: [{ name, connection }] or lifts: <int> (count-only, synthesised)

_DATA_PATH = Path(__file__).resolve().parent / "data" / "stations.json"
_EQUIPMENT_TYPES = ["lift", "escalator", "overcrowding", "custom"]


def _load_station_data() -> list[dict]:
    return json.loads(_DATA_PATH.read_text(encoding="utf-8"))


def seed_defaults(db: Session) -> None:
    """Insert default equipment types, stations, platforms, and equipment if not already present."""
    stations_data = _load_station_data()

    # Equipment types --------------------------------------------------------
    types = {t.name: t for t in db.query(EquipmentType).all()}
    for name in _EQUIPMENT_TYPES:
        if name not in types:
            types[name] = EquipmentType(name=name)
            db.add(types[name])
    db.flush()

    # Stations ---------------------------------------------------------------
    stations = {s.name: s for s in db.query(Station).all()}
    for data in stations_data:
        if data["name"] not in stations:
            coords = data.get("coordinates") or {}
            toilets = data.get("toilets") or []
            zone_list = data.get("zones") or []
            stations[data["name"]] = Station(
                name=data["name"],
                tfl_id=data.get("id"),
                latitude=coords.get("lat"),
                longitude=coords.get("lng"),
                wifi=bool(data.get("wifi", False)),
                zones=",".join(str(z) for z in zone_list) if zone_list else None,
                has_toilets=bool(toilets),
                has_accessible_toilets=any(t.get("accessible") for t in toilets),
                blue_badge_parking=bool(data.get("blueBadgeParking", False)),
                taxi_rank=bool(data.get("taxiRank", False)),
            )
            db.add(stations[data["name"]])
    db.flush()

    # Lines (canonical, one row per distinct name) ---------------------------
    lines = {line.name: line for line in db.query(Line).all()}

    def lines_for(lines_data: list | str) -> list[Line]:
        """Resolve lines into shared Line rows. Accepts both a list and a comma string."""
        if isinstance(lines_data, list):
            names = [n.strip() for n in lines_data if n.strip()]
        else:
            names = [n.strip() for n in (lines_data or "").split(",") if n.strip()]
        result = []
        for name in names:
            if name not in lines:
                lines[name] = Line(name=name)
                db.add(lines[name])
            result.append(lines[name])
        return result

    def platform_step_free(plat: dict) -> PlatformStepFree:
        """Resolve a platform's step-free access. The dataset stores "Full" capitalised;
        lower-casing maps it to the portable "full" value and leaves the rest unchanged."""
        return PlatformStepFree(plat.get("stepFreeAccess", "none").lower())

    # Platforms (unique per station + name) ----------------------------------
    platforms = {(p.station_id, p.name): p for p in db.query(Platform).all()}
    for data in stations_data:
        station = stations[data["name"]]
        for plat in data["platforms"]:
            key = (station.id, plat["name"])
            if key not in platforms:
                platforms[key] = Platform(
                    station_id=station.id,
                    name=plat["name"],
                    step_free=platform_step_free(plat),
                    lines=lines_for(plat.get("lines", [])),
                    direction=plat.get("direction"),
                    interchange_to=plat.get("interchangeTo"),
                    same_level_platforms=plat.get("sameLevelPlatforms"),
                )
                db.add(platforms[key])
    db.flush()

    # Equipment. The (station, type, connection) key keeps inserts idempotent.
    existing = {
        (e.station_id, e.equipment_type_id, e.connection) for e in db.query(Equipment).all()
    }

    def add_equipment(
        station_id: int, type_id: int, connection: str, platform_id: int | None
    ) -> None:
        key = (station_id, type_id, connection)
        if key in existing:
            return
        existing.add(key)
        db.add(
            Equipment(
                station_id=station_id,
                equipment_type_id=type_id,
                platform_id=platform_id,
                connection=connection,
            )
        )

    def lift_connection(unit: dict) -> str:
        """Build a connection string. Prefer the curated, rider-readable
        `description` (e.g. "Booking Hall ↔ Eastbound platforms"); otherwise fall
        back to a raw "from → to" route or the legacy {connection} format."""
        if "connection" in unit:
            return f"{unit['name']}: {unit['connection']}"
        if unit.get("description"):
            return f"{unit['name']}: {unit['description']}"
        return f"{unit['name']}: {unit.get('from', '')} → {unit.get('to', '')}"

    def escalator_connection(unit: dict) -> str:
        return f"{unit['name']}: {unit.get('from', 'Street')} → {unit.get('to', 'platform')}"

    lift_type_id = types["lift"].id
    escalator_type_id = types["escalator"].id
    overcrowding_type_id = types["overcrowding"].id
    custom_type_id = types["custom"].id
    for data in stations_data:
        station = stations[data["name"]]
        station_platforms = [platforms[(station.id, p["name"])] for p in data["platforms"]]

        # Lifts: prefer named units; otherwise synthesise from the count.
        lift_units = data.get("lift_units")
        if lift_units:
            for unit in lift_units:
                add_equipment(station.id, lift_type_id, lift_connection(unit), None)
        else:
            for i in range(data.get("lifts", 0)):
                platform = (
                    station_platforms[i % len(station_platforms)] if station_platforms else None
                )
                target = platform.name if platform else "platforms"
                add_equipment(
                    station.id,
                    lift_type_id,
                    f"Lift {i + 1}: street → {target}",
                    platform.id if platform else None,
                )

        # Escalators: prefer named units from escalator_units (mocked from enrichment script);
        # otherwise fall back to count-based synthesis round-robin across platforms.
        escalator_units = data.get("escalator_units")
        if escalator_units:
            for unit in escalator_units:
                add_equipment(station.id, escalator_type_id, escalator_connection(unit), None)
        else:
            for i in range(data.get("escalators", 0)):
                platform = (
                    station_platforms[i % len(station_platforms)] if station_platforms else None
                )
                target = platform.name if platform else "platforms"
                add_equipment(
                    station.id,
                    escalator_type_id,
                    f"Escalator {i + 1}: street → {target}",
                    platform.id if platform else None,
                )

        # Overcrowding: one virtual equipment row per station used to attach overcrowding reports.
        add_equipment(station.id, overcrowding_type_id, "General overcrowding", None)

        # Custom: one virtual equipment row per station used to attach freeform custom reports.
        add_equipment(station.id, custom_type_id, "Custom issue", None)
    db.commit()

    # Demo trusted account ---------------------------------------------------
    # Signup always yields an untrusted user and there is no in-app promotion flow yet, so seed one
    # trusted account (password "password123") to demonstrate trusted-reporter behaviour.
    # IMPORTANT: only seed demo credentials when explicitly enabled.
    import os

    if os.environ.get("DRP_SEED_DEMO_USERS") == "1":
        user_repo = UserRepository(db)
        if user_repo.get_by_username("trusted_demo") is None:
            demo = user_repo.create("trusted_demo", "password123")
            demo.role = UserRole.TRUSTED.value
            db.commit()
