"""Tests for the live outage-report SSE stream and its in-process event broker.

`GET /outage-reports/stream` sends a `snapshot` of the currently-open feed on connect, then pushes
`created` / `deleted` / `resolved` events as reports change.

No in-process HTTP client can read an endless SSE stream — both Starlette's TestClient and httpx's
ASGITransport buffer the response body to completion. So these tests drive the layer directly
beneath HTTP: the endpoint's response generator is iterated for its yielded event frames, and the
create/delete/resolve handlers are called directly to trigger broker publishes. Everything runs
under `asyncio.run`, with each read bounded by a timeout so a stalled stream fails fast.
"""

import asyncio
import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.events import broker, sse_event
from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.failure import Failure
from app.models.outage_report import OutageReport
from app.models.station import Station
from app.repositories.failure import FailureRepository
from app.repositories.outage_report import OutageReportRepository
from app.routers.failures import resolve_failure
from app.routers.outage_reports import (
    create_outage_report,
    delete_outage_report,
    stream_outage_reports,
)
from app.schemas.outage_report import OutageReportCreate

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BREAKDOWN_TIME = datetime(2024, 6, 1, 9, 0, 0, tzinfo=timezone.utc)


def _equipment_id(db: Session, station_name: str = "Victoria") -> int:
    station = db.query(Station).filter_by(name=station_name).one()
    equipment_type = db.query(EquipmentType).filter_by(name="lift").one()
    return (
        db.query(Equipment)
        .filter_by(station_id=station.id, equipment_type_id=equipment_type.id)
        .first()
        .id
    )


def _create_report(db: Session, station_name: str = "Victoria") -> OutageReport:
    """Insert a report directly via ORM, reusing the equipment's open failure if any."""
    equipment_id = _equipment_id(db, station_name)
    failure = db.query(Failure).filter_by(equipment_id=equipment_id, resolved=False).first()
    if failure is None:
        failure = Failure(equipment_id=equipment_id)
        db.add(failure)
        db.flush()
    report = OutageReport(failure_id=failure.id, breakdown_time=_BREAKDOWN_TIME)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


async def _next_event(generator, want: str, timeout: float = 2.0):
    """Pull frames off the stream generator until one named *want* arrives; return its JSON data."""

    async def _loop():
        while True:
            event = await generator.__anext__()
            if event.get("event") == want:
                return json.loads(event["data"]) if event.get("data") else None

    return await asyncio.wait_for(_loop(), timeout)


async def _open_stream(db_session: Session):
    """Bind the broker to this loop and return the stream endpoint's event generator."""
    broker.bind_loop(asyncio.get_running_loop())
    response = await stream_outage_reports(repo=OutageReportRepository(db_session))
    assert response.media_type == "text/event-stream"
    return response.body_iterator


# ---------------------------------------------------------------------------
# Broker (thread-safe publish → subscription queue)
# ---------------------------------------------------------------------------


def test_broker_delivers_published_event_to_subscriber() -> None:
    async def scenario() -> None:
        broker.bind_loop(asyncio.get_running_loop())
        async with broker.subscription() as queue:
            # publish() runs off the loop thread, as it does from a sync (threadpool) endpoint.
            await asyncio.to_thread(broker.publish, {"event": "created", "data": "hello"})
            event = await asyncio.wait_for(queue.get(), 1)
            assert event == {"event": "created", "data": "hello"}

    asyncio.run(scenario())


def test_broker_fans_out_to_multiple_subscribers() -> None:
    async def scenario() -> None:
        broker.bind_loop(asyncio.get_running_loop())
        async with broker.subscription() as a, broker.subscription() as b:
            await asyncio.to_thread(broker.publish, {"event": "deleted", "data": "{}"})
            got_a = await asyncio.wait_for(a.get(), 1)
            got_b = await asyncio.wait_for(b.get(), 1)
            assert got_a["event"] == "deleted"
            assert got_b["event"] == "deleted"

    asyncio.run(scenario())


def test_publish_without_bound_loop_is_a_noop() -> None:
    # A fresh broker has no loop bound; publishing must not raise.
    from app.events import OutageEventBroker

    OutageEventBroker().publish(sse_event("created", {"id": 1}))


# ---------------------------------------------------------------------------
# Stream — snapshot on connect
# ---------------------------------------------------------------------------


def test_stream_is_event_stream_and_emits_snapshot(db_session: Session) -> None:
    async def scenario() -> None:
        generator = await _open_stream(db_session)
        await _next_event(generator, "snapshot")  # media_type asserted in _open_stream
        await generator.aclose()

    asyncio.run(scenario())


def test_stream_snapshot_is_empty_when_no_reports(db_session: Session) -> None:
    async def scenario() -> None:
        generator = await _open_stream(db_session)
        data = await _next_event(generator, "snapshot")
        assert data == {"reports": []}
        await generator.aclose()

    asyncio.run(scenario())


def test_stream_snapshot_contains_open_reports(db_session: Session) -> None:
    report = _create_report(db_session)

    async def scenario() -> None:
        generator = await _open_stream(db_session)
        data = await _next_event(generator, "snapshot")
        assert [r["id"] for r in data["reports"]] == [report.id]
        assert data["reports"][0]["failure"]["equipment"]["station"]["name"] == "Victoria"
        await generator.aclose()

    asyncio.run(scenario())


def test_stream_snapshot_excludes_resolved_failures(db_session: Session) -> None:
    report = _create_report(db_session)
    resolve_failure(report.failure_id, repo=FailureRepository(db_session))

    async def scenario() -> None:
        generator = await _open_stream(db_session)
        data = await _next_event(generator, "snapshot")
        assert data == {"reports": []}
        await generator.aclose()

    asyncio.run(scenario())


def test_stream_snapshot_excludes_soft_deleted(db_session: Session) -> None:
    report = _create_report(db_session)
    delete_outage_report(report.id, repo=OutageReportRepository(db_session))

    async def scenario() -> None:
        generator = await _open_stream(db_session)
        data = await _next_event(generator, "snapshot")
        assert data == {"reports": []}
        await generator.aclose()

    asyncio.run(scenario())


# ---------------------------------------------------------------------------
# Live events pushed over an open stream
# ---------------------------------------------------------------------------


def test_stream_pushes_created_event(db_session: Session) -> None:
    async def scenario() -> None:
        generator = await _open_stream(db_session)
        await _next_event(generator, "snapshot")  # subscribes before we publish

        payload = OutageReportCreate(
            equipment_id=_equipment_id(db_session), breakdown_time=_BREAKDOWN_TIME
        )
        created = create_outage_report(
            payload, repo=OutageReportRepository(db_session), current_user=None
        )

        data = await _next_event(generator, "created")
        assert data["id"] == created.id
        assert data["failure"]["equipment"]["station"]["name"] == "Victoria"
        await generator.aclose()

    asyncio.run(scenario())


def test_stream_pushes_deleted_event(db_session: Session) -> None:
    report = _create_report(db_session)

    async def scenario() -> None:
        generator = await _open_stream(db_session)
        await _next_event(generator, "snapshot")

        delete_outage_report(report.id, repo=OutageReportRepository(db_session))

        data = await _next_event(generator, "deleted")
        assert data == {"id": report.id}
        await generator.aclose()

    asyncio.run(scenario())


def test_stream_pushes_resolved_event(db_session: Session) -> None:
    report = _create_report(db_session)
    failure_id = report.failure_id

    async def scenario() -> None:
        generator = await _open_stream(db_session)
        await _next_event(generator, "snapshot")

        resolve_failure(failure_id, repo=FailureRepository(db_session))

        data = await _next_event(generator, "resolved")
        assert data == {"failure_id": failure_id}
        await generator.aclose()

    asyncio.run(scenario())
