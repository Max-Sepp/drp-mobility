from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.failure import Failure
from app.models.station import Station
from app.repositories.outage_report import OutageReportRepository

_BASE_TIME = datetime(2024, 6, 1, 9, 0, 0, tzinfo=timezone.utc)


def _equipment_id(
    db: Session, station_name: str = "Victoria", equipment_type_name: str = "lift"
) -> int:
    station = db.query(Station).filter_by(name=station_name).one()
    equipment_type = db.query(EquipmentType).filter_by(name=equipment_type_name).one()
    return db.query(Equipment).filter_by(
        station_id=station.id, equipment_type_id=equipment_type.id
    ).first().id


def _base_payload(db: Session, **overrides) -> dict:
    payload = {
        "equipment_id": _equipment_id(db),
        "breakdown_time": _BASE_TIME.isoformat(),
    }
    payload.update(overrides)
    return payload


# ---------------------------------------------------------------------------
# Grouping
# ---------------------------------------------------------------------------


def test_two_reports_for_same_equipment_get_same_failure(
    client: TestClient, db_session: Session
) -> None:
    r1 = client.post("/outage-reports", json=_base_payload(db_session))
    r2 = client.post("/outage-reports", json=_base_payload(db_session))

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["failure_id"] == r2.json()["failure_id"]


def test_reports_far_apart_in_time_still_get_same_failure_when_unresolved(
    client: TestClient, db_session: Session
) -> None:
    r1 = client.post("/outage-reports", json=_base_payload(db_session))
    r2 = client.post(
        "/outage-reports",
        json=_base_payload(
            db_session,
            breakdown_time=(_BASE_TIME + timedelta(days=30)).isoformat(),
        ),
    )

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["failure_id"] == r2.json()["failure_id"]


def test_reports_for_different_equipment_get_different_failures(
    client: TestClient, db_session: Session
) -> None:
    lift_id = _equipment_id(db_session, "Victoria", "lift")
    escalator_id = _equipment_id(db_session, "Victoria", "escalator")

    r1 = client.post("/outage-reports", json=_base_payload(db_session, equipment_id=lift_id))
    r2 = client.post("/outage-reports", json=_base_payload(db_session, equipment_id=escalator_id))

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["failure_id"] != r2.json()["failure_id"]


def test_reports_for_different_station_get_different_failures(
    client: TestClient, db_session: Session
) -> None:
    victoria_id = _equipment_id(db_session, "Victoria", "lift")
    waterloo_id = _equipment_id(db_session, "Waterloo", "lift")

    r1 = client.post("/outage-reports", json=_base_payload(db_session, equipment_id=victoria_id))
    r2 = client.post("/outage-reports", json=_base_payload(db_session, equipment_id=waterloo_id))

    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["failure_id"] != r2.json()["failure_id"]


def test_report_after_resolved_failure_starts_new_failure(
    client: TestClient, db_session: Session
) -> None:
    r1 = client.post("/outage-reports", json=_base_payload(db_session))
    assert r1.status_code == 201
    original_failure_id = r1.json()["failure_id"]

    client.patch(f"/failures/{original_failure_id}/resolve")

    r2 = client.post("/outage-reports", json=_base_payload(db_session))
    assert r2.status_code == 201
    assert r2.json()["failure_id"] != original_failure_id


def test_two_sequential_failures_for_same_equipment_have_distinct_ids(
    client: TestClient, db_session: Session
) -> None:
    r1 = client.post("/outage-reports", json=_base_payload(db_session))
    failure_a = r1.json()["failure_id"]
    client.patch(f"/failures/{failure_a}/resolve")

    r2 = client.post("/outage-reports", json=_base_payload(db_session))
    failure_b = r2.json()["failure_id"]
    client.patch(f"/failures/{failure_b}/resolve")

    assert failure_a != failure_b


# ---------------------------------------------------------------------------
# Concurrency guard: one open failure per equipment
# ---------------------------------------------------------------------------


def test_second_open_failure_for_equipment_is_rejected(db_session: Session) -> None:
    equipment_id = _equipment_id(db_session)
    db_session.add(Failure(equipment_id=equipment_id))
    db_session.commit()

    db_session.add(Failure(equipment_id=equipment_id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_resolved_failures_do_not_block_a_new_open_failure(db_session: Session) -> None:
    equipment_id = _equipment_id(db_session)
    db_session.add(Failure(equipment_id=equipment_id, resolved=True))
    db_session.add(Failure(equipment_id=equipment_id, resolved=True))
    db_session.add(Failure(equipment_id=equipment_id, resolved=False))

    db_session.commit()  # partial index only covers resolved=false rows, so this is allowed

    open_failures = (
        db_session.query(Failure)
        .filter_by(equipment_id=equipment_id, resolved=False)
        .count()
    )
    assert open_failures == 1


def test_find_or_create_failure_recovers_from_a_concurrent_insert(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Simulate losing the create race: the initial SELECT misses, the INSERT hits the unique
    index, and the repository recovers by re-reading the open failure the winner committed."""
    equipment_id = _equipment_id(db_session)
    winner = Failure(equipment_id=equipment_id)
    db_session.add(winner)
    db_session.commit()
    winner_id = winner.id

    repo = OutageReportRepository(db_session)
    real_find_open = repo._find_open_failure
    calls = {"n": 0}

    def fake_find_open(eid: int):
        calls["n"] += 1
        # First call = the pre-insert SELECT: pretend we saw no open failure (the race).
        # Later call = the post-conflict re-read: behave normally and find the winner.
        if calls["n"] == 1:
            return None
        return real_find_open(eid)

    monkeypatch.setattr(repo, "_find_open_failure", fake_find_open)

    failure = repo._find_or_create_failure(equipment_id)

    assert failure.id == winner_id


# ---------------------------------------------------------------------------
# GET /failures
# ---------------------------------------------------------------------------


def test_list_failures_empty(client: TestClient) -> None:
    response = client.get("/failures")

    assert response.status_code == 200
    assert response.json() == []


def test_list_failures_returns_all(client: TestClient, db_session: Session) -> None:
    client.post("/outage-reports", json=_base_payload(db_session))
    client.post(
        "/outage-reports",
        json=_base_payload(db_session, equipment_id=_equipment_id(db_session, "Waterloo")),
    )

    response = client.get("/failures")

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_failures_includes_resolved_field(client: TestClient, db_session: Session) -> None:
    client.post("/outage-reports", json=_base_payload(db_session))

    response = client.get("/failures")

    assert response.status_code == 200
    failure = response.json()[0]
    assert "resolved" in failure
    assert failure["resolved"] is False


def test_list_failures_includes_report_count(client: TestClient, db_session: Session) -> None:
    payload = _base_payload(db_session)
    client.post("/outage-reports", json=payload)
    client.post(
        "/outage-reports",
        json={**payload, "breakdown_time": (_BASE_TIME + timedelta(hours=1)).isoformat()},
    )

    response = client.get("/failures")

    assert response.status_code == 200
    assert response.json()[0]["report_count"] == 2


def test_list_failures_report_count_excludes_soft_deleted(
    client: TestClient, db_session: Session
) -> None:
    payload = _base_payload(db_session)
    r1 = client.post("/outage-reports", json=payload)
    client.post(
        "/outage-reports",
        json={**payload, "breakdown_time": (_BASE_TIME + timedelta(hours=1)).isoformat()},
    )
    client.delete(f"/outage-reports/{r1.json()['id']}")

    response = client.get("/failures")

    assert response.status_code == 200
    assert response.json()[0]["report_count"] == 1


def test_list_failures_includes_first_reported(client: TestClient, db_session: Session) -> None:
    client.post("/outage-reports", json=_base_payload(db_session))

    response = client.get("/failures")

    assert response.status_code == 200
    assert response.json()[0]["first_reported"] is not None


# ---------------------------------------------------------------------------
# GET /failures/{id}
# ---------------------------------------------------------------------------


def test_get_failure_returns_detail(client: TestClient, db_session: Session) -> None:
    r = client.post("/outage-reports", json=_base_payload(db_session))
    failure_id = r.json()["failure_id"]

    response = client.get(f"/failures/{failure_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == failure_id
    assert body["equipment"]["station"]["name"] == "Victoria"
    assert body["equipment"]["equipment_type"]["name"] == "lift"
    assert len(body["reports"]) == 1


def test_get_failure_excludes_soft_deleted_reports(
    client: TestClient, db_session: Session
) -> None:
    payload = _base_payload(db_session)
    r1 = client.post("/outage-reports", json=payload)
    r2 = client.post(
        "/outage-reports",
        json={**payload, "breakdown_time": (_BASE_TIME + timedelta(hours=1)).isoformat()},
    )
    failure_id = r1.json()["failure_id"]

    client.delete(f"/outage-reports/{r1.json()['id']}")

    response = client.get(f"/failures/{failure_id}")
    assert response.status_code == 200
    assert len(response.json()["reports"]) == 1
    assert response.json()["reports"][0]["id"] == r2.json()["id"]


def test_get_failure_not_found_returns_404(client: TestClient) -> None:
    response = client.get("/failures/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Failure not found"}


# ---------------------------------------------------------------------------
# PATCH /failures/{id}/resolve
# ---------------------------------------------------------------------------


def test_resolve_failure_returns_resolved_true(client: TestClient, db_session: Session) -> None:
    r = client.post("/outage-reports", json=_base_payload(db_session))
    failure_id = r.json()["failure_id"]

    response = client.patch(f"/failures/{failure_id}/resolve")

    assert response.status_code == 200
    assert response.json()["resolved"] is True


def test_resolve_failure_not_found_returns_404(client: TestClient) -> None:
    response = client.patch("/failures/999/resolve")

    assert response.status_code == 404
    assert response.json() == {"detail": "Failure not found"}


def test_resolve_failure_is_persisted(client: TestClient, db_session: Session) -> None:
    r = client.post("/outage-reports", json=_base_payload(db_session))
    failure_id = r.json()["failure_id"]

    client.patch(f"/failures/{failure_id}/resolve")

    db_session.expire_all()
    failure = db_session.get(Failure, failure_id)
    assert failure.resolved is True
