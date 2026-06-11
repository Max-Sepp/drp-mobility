"""Poll TfL's disruption feeds and fold them into our own outage model.

Two buckets (see the plan / repo docs):
  A — a lift outage we can match to a specific Equipment row becomes a Failure + OutageReport
      (source="tfl", pre-verified).
  B — anything else accessibility-relevant (unmatched lift outages, step-free loss, closures)
      becomes a StationAlert.

Privilege order is enforced here: the automated feed ranks *below* a trusted human, so a
human's authoritative close (resolved_authoritative / dismissed_authoritative) is never undone
by this poller.

All knowledge of TfL's wire format lives in the small extraction helpers at the bottom, so
adapting to the real payload shape is a localised change.
"""

import logging
import os
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.events import broker, sse_event
from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.station import Station
from app.models.station_alert import StationAlertKind
from app.repositories.failure import FailureRepository
from app.repositories.outage_report import OutageReportRepository
from app.repositories.station_alert import StationAlertRepository
from app.schemas.outage_report import OutageReportSummary
from app.services import tfl
from app.services.notifications import notify_affected_users
from app.services.station_matching import normalise_station_name

_log = logging.getLogger(__name__)

_DEFAULT_MODES = "tube,dlr,overground,elizabeth-line"
_ACCESSIBILITY_KEYWORDS = (
    "step-free", "step free", "stepfree", "lift", "escalator", "accessible",
    "wheelchair", "ramp", "level access",
)  # fmt: skip


@dataclass
class IngestSummary:
    """Counts returned by a single ingest run (also the admin endpoint's response body)."""

    reports_created: int = 0
    reports_deduped: int = 0
    failures_opened: int = 0
    failures_resolved: int = 0
    suppressed_authoritative: int = 0
    alerts_upserted: int = 0
    alerts_cleared: int = 0
    unresolved_stations: int = 0

    def as_dict(self) -> dict[str, int]:
        return asdict(self)


def ingest_once(db: Session | None = None) -> IngestSummary:
    """Run one poll/ingest cycle.

    When *db* is supplied (request handlers, tests) it is used as-is; otherwise a private session
    is opened and closed (the background loop). Never raises on feed/network failure — those are
    logged and treated as an empty feed."""
    if db is not None:
        return _ingest(db)
    session = SessionLocal()
    try:
        return _ingest(session)
    finally:
        session.close()


def _ingest(db: Session) -> IngestSummary:
    summary = IngestSummary()
    now = datetime.now(timezone.utc)

    reports = OutageReportRepository(db)
    failures = FailureRepository(db)
    alerts = StationAlertRepository(db)

    exact_names, norm_names, by_tfl_id = _build_station_index(db)
    lift_index = _build_lift_index(db)

    def resolve_lift_station(d: dict) -> Station | None:
        # Primary: stationUniqueId -> our NaPTAN code. Fallback: the "<Name>: ..." message prefix.
        station = by_tfl_id.get(_lift_station_uid(d))
        if station is not None:
            return station
        prefix = _lift_message(d).split(":", 1)[0]
        return _resolve_station(prefix, exact_names, norm_names)

    seen_failure_refs: set[str] = set()
    seen_alert_refs: set[str] = set()
    new_failure_ids: list[int] = []

    def open_bucket_a(equipment_id: int, ref: str, message: str) -> None:
        seen_failure_refs.add(ref)
        if reports.find_open_tfl_report(ref) is not None:
            summary.reports_deduped += 1
            return
        if reports.is_ref_authoritatively_resolved(ref):
            summary.suppressed_authoritative += 1
            return
        report, new_failure_id = reports.create_tfl(equipment_id, now, ref, message)
        summary.reports_created += 1
        broker.publish(sse_event("created", _report_payload(report)))
        if new_failure_id is not None:
            summary.failures_opened += 1
            new_failure_ids.append(new_failure_id)

    def open_bucket_b(station_id: int, ref: str, message: str) -> None:
        seen_alert_refs.add(ref)
        kind = _classify_disruption(message) or StationAlertKind.LIFT_OUTAGE
        if alerts.upsert_active(station_id, kind, message, ref, now) is not None:
            summary.alerts_upserted += 1

    # --- Lift feed -> bucket A (lift we carry) / B (unmatched or station-level) ---
    for d in _safe_fetch(tfl.fetch_lift_disruptions):
        station = resolve_lift_station(d)
        if station is None:
            summary.unresolved_stations += 1
            continue
        message = _lift_message(d) or "Lift disruption reported by TfL."
        station_uid = _lift_station_uid(d)
        lift_uids = _lift_unit_ids(d)
        if not lift_uids:
            # No identifiable unit — a station-level step-free notice (bucket B).
            open_bucket_b(station.id, f"lift:{station_uid or station.id}", message)
            continue
        for luid in lift_uids:
            equipment = _match_lift_unit(lift_index.get(station.id, []), luid, station_uid)
            if equipment is not None:
                open_bucket_a(equipment.id, luid, message)
            else:
                open_bucket_b(station.id, luid, message)

    # --- StopPoint feed -> bucket B (accessibility advisories) --------------
    modes = os.getenv("TFL_STOPPOINT_MODES", _DEFAULT_MODES)
    for d in _safe_fetch(tfl.fetch_stoppoint_disruptions, modes):
        message = _sp_message(d)
        kind = _classify_disruption(f"{message} {_sp_category(d)}")
        if kind is None:
            continue
        station = by_tfl_id.get(_sp_station_uid(d)) or _resolve_station(
            _sp_station_name(d), exact_names, norm_names
        )
        if station is None:
            summary.unresolved_stations += 1
            continue
        ref = _sp_ref(d, station)
        seen_alert_refs.add(ref)
        if alerts.upsert_active(station.id, kind, message, ref, now) is not None:
            summary.alerts_upserted += 1

    # --- Reconcile lift clears ---------------------------------------------
    # Group open TfL reports by failure: resolve only when *no* ref is still reported and no
    # human evidence remains. (A human-closed issue is already resolved, so it won't appear here.)
    refs_by_failure: dict[int, list[str]] = defaultdict(list)
    for r in reports.list_open_tfl_reports():
        refs_by_failure[r.failure_id].append(r.external_ref)
    for failure_id, refs in refs_by_failure.items():
        if any(ref in seen_failure_refs for ref in refs):
            continue
        if not failures.active_reports_all_tfl(failure_id):
            continue
        failure = failures.get(failure_id)
        if failure is None or failure.resolved:
            continue
        failures.resolve(failure)
        summary.failures_resolved += 1
        broker.publish(sse_event("resolved", {"failure_id": failure_id}))

    # --- Reconcile alert clears --------------------------------------------
    summary.alerts_cleared += len(alerts.deactivate_missing("tfl", seen_alert_refs, now))

    # --- Push notifications for newly opened failures (best-effort) --------
    for failure_id in new_failure_ids:
        try:
            notify_affected_users(failure_id)
        except Exception:
            _log.exception("TfL ingest: notification dispatch failed for failure %d", failure_id)

    _log.info("TfL ingest complete: %s", summary.as_dict())
    return summary


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------


def _build_station_index(
    db: Session,
) -> tuple[dict[str, Station], list[tuple[str, Station]], dict[str, Station]]:
    """Return lookups for resolving a TfL disruption to one of our stations.

    Primary key is the TfL NaPTAN code (Station.tfl_id), which the feed gives as stationUniqueId.
    Name lookups (exact normalised, then substring containment) are the fallback for entries whose
    code we don't carry."""
    stations = db.query(Station).all()
    exact: dict[str, Station] = {}
    norm_list: list[tuple[str, Station]] = []
    by_tfl_id: dict[str, Station] = {}
    for s in stations:
        n = normalise_station_name(s.name)
        exact.setdefault(n, s)
        norm_list.append((n, s))
        if s.tfl_id:
            by_tfl_id[s.tfl_id] = s
    norm_list.sort(key=lambda t: len(t[0]), reverse=True)
    return exact, norm_list, by_tfl_id


def _resolve_station(
    name: str, exact: dict[str, Station], norm_list: list[tuple[str, Station]]
) -> Station | None:
    target = normalise_station_name(name) if name else ""
    if not target:
        return None
    direct = exact.get(target)
    if direct is not None:
        return direct
    # Containment fallback, mirroring the notification matcher. Guard short names to avoid
    # spurious hits ("Oval" inside an unrelated string).
    for n, station in norm_list:
        if len(n) >= 4 and (n in target or target in n):
            return station
    return None


def _build_lift_index(db: Session) -> dict[int, list[Equipment]]:
    """Return station_id -> its lift Equipment rows."""
    rows = (
        db.query(Equipment)
        .join(EquipmentType, Equipment.equipment_type_id == EquipmentType.id)
        .filter(EquipmentType.name == "lift")
        .all()
    )
    index: dict[int, list[Equipment]] = defaultdict(list)
    for e in rows:
        index[e.station_id].append(e)
    return index


def _match_lift_unit(lifts: list[Equipment], lift_uid: str, station_uid: str) -> Equipment | None:
    """Match a disrupted lift's unique id to one of a station's lift Equipment rows.

    The feed's id is "<stationUniqueId>-Lift-2"; our lift rows carry a connection like
    "Lift 2: …", whose leading name matches the suffix. Returns None when the named unit isn't one
    we carry (the caller then routes it to a StationAlert)."""
    name = _lift_unit_name(lift_uid, station_uid)
    if not name:
        return None
    for eq in lifts:
        if eq.connection.split(":", 1)[0].strip().lower() == name:
            return eq
    return None


def _lift_unit_name(lift_uid: str, station_uid: str) -> str:
    """ "940GZZLUMDN-Lift-2" -> "lift 2" (the station-code prefix stripped, dashes spaced)."""
    suffix = lift_uid
    if station_uid and lift_uid.startswith(f"{station_uid}-"):
        suffix = lift_uid[len(station_uid) + 1 :]
    return re.sub(r"[-_]+", " ", suffix).strip().lower()


# ---------------------------------------------------------------------------
# Field extraction (the one place that knows TfL's wire shape)
# ---------------------------------------------------------------------------


def _first(d: dict, *keys: str) -> str:
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "x"


def _report_payload(report) -> dict:
    return OutageReportSummary.model_validate(report).model_dump(mode="json")


def _safe_fetch(fn, *args) -> list[dict]:
    try:
        return fn(*args)
    except Exception:
        _log.exception("TfL feed fetch failed: %s", getattr(fn, "__name__", fn))
        return []


# -- lift feed (Disruptions/Lifts/v2) --
def _lift_station_uid(d: dict) -> str:
    return _first(d, "stationUniqueId", "icsCode", "naptanId")


def _lift_message(d: dict) -> str:
    return _first(d, "message", "description", "currentUpdate", "additionalInformation")


def _lift_unit_ids(d: dict) -> list[str]:
    v = d.get("disruptedLiftUniqueIds")
    if not isinstance(v, list):
        return []
    return [x.strip() for x in v if isinstance(x, str) and x.strip()]


# -- stop-point feed --
def _sp_station_uid(d: dict) -> str:
    return _first(d, "stationAtcoCode", "atcoCode", "naptanId", "stationUniqueId")


def _sp_station_name(d: dict) -> str:
    return _first(d, "commonName", "stopPointName", "name")


def _sp_message(d: dict) -> str:
    return _first(d, "description", "additionalInformation", "message")


def _sp_category(d: dict) -> str:
    return _first(d, "category", "categoryDescription", "type")


def _sp_ref(d: dict, station: Station) -> str:
    explicit = _first(d, "id", "disruptionId")
    if explicit:
        return explicit
    return f"sp:{station.id}:{_slug(_sp_message(d))}"


def _classify_disruption(text: str) -> StationAlertKind | None:
    """Classify a disruption's text, or return None if it isn't accessibility-relevant."""
    t = text.lower()
    if not any(k in t for k in _ACCESSIBILITY_KEYWORDS):
        return None
    if "step-free" in t or "step free" in t or "stepfree" in t:
        return StationAlertKind.STEP_FREE_UNAVAILABLE
    if "clos" in t:
        return StationAlertKind.CLOSURE
    return StationAlertKind.ACCESSIBILITY
