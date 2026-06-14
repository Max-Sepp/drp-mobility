"""Tests for seeding real, named lifts from the TfL step-free feed.

The seed no longer synthesises generic "Lift N: street → platform" placeholders.
It loads the real lifts published in the feed (data/stations.json): each carries
its published name (e.g. "Lift A") and a human-readable connection.
"""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.station import Station


def _equipment_for(client: TestClient, db_session: Session, station_name: str) -> list[dict]:
    station = db_session.query(Station).filter_by(name=station_name).one()
    response = client.get(f"/equipment?station_id={station.id}")
    assert response.status_code == 200
    return response.json()


def _lift_connections(items: list[dict]) -> list[str]:
    return [e["connection"] for e in items if e["equipment_type"]["name"] == "lift"]


def test_real_lift_carries_name_and_decoded_connection(
    client: TestClient, db_session: Session
) -> None:
    # Acton Town's two lifts run from the booking hall to the platforms.
    connections = _lift_connections(_equipment_for(client, db_session, "Acton Town"))

    assert len(connections) == 2
    # Each connection names the lift and describes a decoded, bidirectional route.
    assert all(c.startswith("Lift ") for c in connections)
    assert all(" ↔ " in c for c in connections)
    assert any("Booking Hall" in c and "Platform" in c for c in connections)


def test_lift_connections_are_not_synthetic_placeholders(
    client: TestClient, db_session: Session
) -> None:
    connections = _lift_connections(_equipment_for(client, db_session, "Acton Town"))

    # The old generator produced "Lift 1: street → platforms" style strings.
    assert not any(c.endswith("street → platforms") for c in connections)


def test_seed_adds_non_tube_feed_station_with_real_lifts(
    client: TestClient, db_session: Session
) -> None:
    # Bromley South is National Rail only — absent from the live-API tube base, but the
    # step-free feed lists it with two lifts, so seeding must now create it.
    names = {s["name"] for s in client.get("/stations").json()}
    assert "Bromley South" in names

    connections = _lift_connections(_equipment_for(client, db_session, "Bromley South"))
    assert len(connections) == 2
    assert all(c.startswith("Lift ") and " ↔ " in c for c in connections)


def test_named_lifts_merge_onto_a_single_station(client: TestClient, db_session: Session) -> None:
    # The feed's "King's Cross St Pancras" must merge onto the tube base's
    # "King's Cross & St Pancras International" rather than create a duplicate station.
    names = [s["name"] for s in client.get("/stations").json()]
    assert names.count("King's Cross & St Pancras International") == 1
    assert "King's Cross St Pancras" not in names

    connections = _lift_connections(
        _equipment_for(client, db_session, "King's Cross & St Pancras International")
    )
    assert len(connections) == 13


def test_each_lift_seeded_as_its_own_equipment_row(client: TestClient, db_session: Session) -> None:
    # Named lifts from the feed each become their own Equipment row.
    # Synthesised fallbacks (street ↔ platform) are excluded from this count.
    all_equipment = client.get("/equipment").json()
    lifts = [e for e in all_equipment if e["equipment_type"]["name"] == "lift"]
    feed_lifts = [e for e in lifts if "street ↔ " not in e["connection"].lower()]
    assert len(feed_lifts) == 569
    assert len(lifts) >= 569
