"""Tests for the TfL disruption poller (services/tfl_ingest.py).

The TfL HTTP client is monkeypatched with canned payloads — no network. Cases cover both
buckets (matched lift -> Failure, unmatched/step-free -> StationAlert), idempotency, clear
reconciliation, and the hard requirement that a trusted human's close/dismiss is final.
"""

from collections import defaultdict
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.failure import Failure
from app.models.outage_report import OutageReport
from app.models.station import Station
from app.models.station_alert import StationAlert, StationAlertKind
from app.models.user import UserRole
from app.repositories.outage_report import OutageReportRepository
from app.schemas.outage_report import OutageReportCreate
from app.services import tfl_ingest

_NOW = datetime(2026, 6, 1, 9, 0, 0, tzinfo=timezone.utc)
_MSG = "No Step Free Access - a lift is out of service."


@pytest.fixture(autouse=True)
def _no_push(monkeypatch: pytest.MonkeyPatch) -> None:
    """Stop the ingest's best-effort push dispatch from opening a real (dev.db) session."""
    monkeypatch.setattr(tfl_ingest, "notify_affected_users", lambda *a, **k: None)


def _patch_feeds(
    monkeypatch: pytest.MonkeyPatch,
    lifts: list[dict] | None = None,
    stoppoints: list[dict] | None = None,
) -> None:
    monkeypatch.setattr(tfl_ingest.tfl, "fetch_lift_disruptions", lambda: lifts or [])
    monkeypatch.setattr(
        tfl_ingest.tfl, "fetch_stoppoint_disruptions", lambda modes: stoppoints or []
    )


def _single_lift_station(db: Session) -> tuple[Station, Equipment]:
    """Find a station that has exactly one lift and a TfL id, so a match is unambiguous."""
    lifts = (
        db.query(Equipment)
        .join(EquipmentType, Equipment.equipment_type_id == EquipmentType.id)
        .filter(EquipmentType.name == "lift")
        .all()
    )
    by_station: dict[int, list[Equipment]] = defaultdict(list)
    for e in lifts:
        by_station[e.station_id].append(e)
    for station_id, eqs in by_station.items():
        station = db.get(Station, station_id)
        if len(eqs) == 1 and station.tfl_id:
            return station, eqs[0]
    raise AssertionError("no single-lift station with a tfl_id in seed data")


def _lift_unit_id(station: Station, lift: Equipment) -> str:
    """Reconstruct the feed's disruptedLiftUniqueId for a seeded lift, e.g. '940GZZLUMDN-Lift-2'."""
    head = lift.connection.split(":", 1)[0].strip().replace(" ", "-")
    return f"{station.tfl_id}-{head}"


def _lift_payload(station: Station, lift_uids: list[str], message: str) -> dict:
    return {
        "stationUniqueId": station.tfl_id,
        "disruptedLiftUniqueIds": lift_uids,
        "message": message,
    }


# ---------------------------------------------------------------------------
# Bucket A — matched lift -> Failure + OutageReport
# ---------------------------------------------------------------------------


def test_matched_lift_creates_tfl_failure_and_report(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, lift = _single_lift_station(db_session)
    _patch_feeds(monkeypatch, lifts=[_lift_payload(station, [_lift_unit_id(station, lift)], _MSG)])

    summary = tfl_ingest.ingest_once(db_session)

    assert summary.reports_created == 1
    assert summary.failures_opened == 1
    report = db_session.query(OutageReport).one()
    assert report.source == "tfl"
    assert report.verified is True
    assert report.reporter_role == UserRole.TFL.value
    assert report.external_ref == _lift_unit_id(station, lift)
    assert report.failure.equipment_id == lift.id
    # No StationAlert for a matched lift.
    assert db_session.query(StationAlert).count() == 0


def test_reingesting_same_ref_does_not_duplicate(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, lift = _single_lift_station(db_session)
    _patch_feeds(monkeypatch, lifts=[_lift_payload(station, [_lift_unit_id(station, lift)], _MSG)])

    tfl_ingest.ingest_once(db_session)
    second = tfl_ingest.ingest_once(db_session)

    assert second.reports_created == 0
    assert second.reports_deduped == 1
    assert db_session.query(Failure).filter_by(equipment_id=lift.id).count() == 1


def test_cleared_lift_resolves_when_all_reports_are_tfl(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, lift = _single_lift_station(db_session)
    _patch_feeds(monkeypatch, lifts=[_lift_payload(station, [_lift_unit_id(station, lift)], _MSG)])
    tfl_ingest.ingest_once(db_session)

    _patch_feeds(monkeypatch, lifts=[])  # disruption gone from the feed
    summary = tfl_ingest.ingest_once(db_session)

    assert summary.failures_resolved == 1
    failure = db_session.query(Failure).filter_by(equipment_id=lift.id).one()
    assert failure.resolved is True
    assert failure.resolved_authoritative is False


def test_cleared_lift_stays_open_when_a_human_also_reported(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, lift = _single_lift_station(db_session)
    # A human reports the same lift first (opens the shared failure).
    OutageReportRepository(db_session).create(
        OutageReportCreate(equipment_id=lift.id, breakdown_time=_NOW),
        reporter_role=UserRole.UNTRUSTED.value,
    )
    _patch_feeds(monkeypatch, lifts=[_lift_payload(station, [_lift_unit_id(station, lift)], _MSG)])
    tfl_ingest.ingest_once(db_session)

    _patch_feeds(monkeypatch, lifts=[])  # TfL says cleared
    summary = tfl_ingest.ingest_once(db_session)

    assert summary.failures_resolved == 0
    failure = db_session.query(Failure).filter_by(equipment_id=lift.id).one()
    assert failure.resolved is False  # human evidence keeps it open


def test_trusted_close_is_final_poller_does_not_reopen(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    auth_headers_factory,
) -> None:
    station, lift = _single_lift_station(db_session)
    _patch_feeds(monkeypatch, lifts=[_lift_payload(station, [_lift_unit_id(station, lift)], _MSG)])
    tfl_ingest.ingest_once(db_session)
    failure = db_session.query(Failure).filter_by(equipment_id=lift.id).one()

    # Trusted human resolves it (authoritative).
    resp = client.patch(
        f"/failures/{failure.id}/resolve", headers=auth_headers_factory(UserRole.TRUSTED)
    )
    assert resp.status_code == 200

    # The same disruption is still in the feed on the next poll — must NOT reopen.
    summary = tfl_ingest.ingest_once(db_session)

    assert summary.suppressed_authoritative == 1
    assert summary.failures_opened == 0
    assert db_session.query(Failure).filter_by(equipment_id=lift.id).count() == 1
    db_session.expire_all()
    assert db_session.query(Failure).filter_by(equipment_id=lift.id).one().resolved is True


# ---------------------------------------------------------------------------
# Bucket B — StationAlert
# ---------------------------------------------------------------------------


def test_unmatched_lift_becomes_station_alert(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, _lift = _single_lift_station(db_session)
    # A lift id we don't carry (no "Lift 99" equipment) -> no match -> bucket B.
    _patch_feeds(
        monkeypatch,
        lifts=[_lift_payload(station, [f"{station.tfl_id}-Lift-99"], "currently unavailable")],
    )

    summary = tfl_ingest.ingest_once(db_session)

    assert summary.reports_created == 0
    assert summary.alerts_upserted == 1
    alert = db_session.query(StationAlert).one()
    assert alert.kind == StationAlertKind.LIFT_OUTAGE
    assert alert.station_id == station.id
    assert alert.active is True


def test_stoppoint_step_free_disruption_creates_and_clears_alert(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, _lift = _single_lift_station(db_session)
    payload = {
        "commonName": station.name,
        "id": "SP-1",
        "description": "Step-free access is not available at this station.",
        "category": "Information",
    }
    _patch_feeds(monkeypatch, stoppoints=[payload])
    tfl_ingest.ingest_once(db_session)

    alert = db_session.query(StationAlert).one()
    assert alert.kind == StationAlertKind.STEP_FREE_UNAVAILABLE
    assert alert.active is True

    _patch_feeds(monkeypatch, stoppoints=[])  # cleared
    summary = tfl_ingest.ingest_once(db_session)

    assert summary.alerts_cleared == 1
    db_session.expire_all()
    assert db_session.query(StationAlert).one().active is False


def test_non_accessibility_stoppoint_is_ignored(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, _lift = _single_lift_station(db_session)
    payload = {
        "commonName": station.name,
        "id": "SP-2",
        "description": "Minor delays due to an earlier signal failure.",
        "category": "RealTime",
    }
    _patch_feeds(monkeypatch, stoppoints=[payload])

    tfl_ingest.ingest_once(db_session)

    assert db_session.query(StationAlert).count() == 0


def test_dismissed_alert_is_not_reactivated(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    auth_headers_factory,
) -> None:
    station, _lift = _single_lift_station(db_session)
    payload = {
        "commonName": station.name,
        "id": "SP-1",
        "description": "Step-free access is not available at this station.",
    }
    _patch_feeds(monkeypatch, stoppoints=[payload])
    tfl_ingest.ingest_once(db_session)
    alert = db_session.query(StationAlert).one()

    resp = client.patch(
        f"/station-alerts/{alert.id}/dismiss", headers=auth_headers_factory(UserRole.TRUSTED)
    )
    assert resp.status_code == 200

    # Same disruption still reported -> must stay dismissed, no new alert row.
    tfl_ingest.ingest_once(db_session)

    db_session.expire_all()
    alerts = db_session.query(StationAlert).all()
    assert len(alerts) == 1
    assert alerts[0].active is False
    assert alerts[0].dismissed_authoritative is True


# ---------------------------------------------------------------------------
# Read endpoint
# ---------------------------------------------------------------------------


def test_list_station_alerts_endpoint(
    client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    station, _lift = _single_lift_station(db_session)
    payload = {
        "commonName": station.name,
        "id": "SP-1",
        "description": "Step-free access is not available at this station.",
    }
    _patch_feeds(monkeypatch, stoppoints=[payload])
    tfl_ingest.ingest_once(db_session)

    resp = client.get("/station-alerts", params={"active": "true"})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["kind"] == "step_free_unavailable"
    assert body[0]["station"]["name"] == station.name
