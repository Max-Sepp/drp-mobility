from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.failure import Failure
from app.models.outage_report import OutageReport
from app.models.outage_report_deletion import OutageReportDeletion
from app.models.station import Station

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_BREAKDOWN_TIME = datetime(2024, 6, 1, 9, 0, 0, tzinfo=timezone.utc)
_BREAKDOWN_TIME_STR = "2024-06-01T09:00:00Z"


def _equipment_id(
    db: Session, station_name: str = "Victoria", equipment_type_name: str = "lift"
) -> int:
    station = db.query(Station).filter_by(name=station_name).one()
    equipment_type = db.query(EquipmentType).filter_by(name=equipment_type_name).one()
    return db.query(Equipment).filter_by(
        station_id=station.id, equipment_type_id=equipment_type.id
    ).first().id


def _valid_payload(db: Session) -> dict:
    return {
        "equipment_id": _equipment_id(db),
        "breakdown_time": _BREAKDOWN_TIME_STR,
        "description": "Doors not closing",
    }


def _create_report(db: Session, **overrides) -> OutageReport:
    """Insert a report directly via ORM, bypassing grouping logic."""
    station_name = overrides.pop("station", "Victoria")
    equipment_type_name = overrides.pop("equipment_type", "lift")
    breakdown_time = overrides.pop("breakdown_time", _BREAKDOWN_TIME)

    station = db.query(Station).filter_by(name=station_name).one()
    equipment_type = db.query(EquipmentType).filter_by(name=equipment_type_name).one()
    equipment = db.query(Equipment).filter_by(
        station_id=station.id, equipment_type_id=equipment_type.id
    ).first()

    # Reuse the equipment's open failure if one exists (a partial unique index allows only one
    # unresolved failure per equipment); otherwise start a new one.
    failure = db.query(Failure).filter_by(equipment_id=equipment.id, resolved=False).first()
    if failure is None:
        failure = Failure(equipment_id=equipment.id)
        db.add(failure)
        db.flush()

    report = OutageReport(failure_id=failure.id, breakdown_time=breakdown_time, **overrides)
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


# ---------------------------------------------------------------------------
# POST /outage-reports
# ---------------------------------------------------------------------------


def test_create_outage_report_returns_201(client: TestClient, db_session: Session) -> None:
    response = client.post("/outage-reports", json=_valid_payload(db_session))

    assert response.status_code == 201
    body = response.json()
    assert body["id"] is not None
    assert body["failure_id"] is not None
    assert body["failure"]["equipment"]["station"]["name"] == "Victoria"
    assert body["failure"]["equipment"]["equipment_type"]["name"] == "lift"
    assert body["failure"]["equipment"]["connection"] == "street to platform 1"
    assert body["description"] == "Doors not closing"
    assert body["image_content_type"] is None


def test_create_outage_report_description_optional(client: TestClient, db_session: Session) -> None:
    payload = {k: v for k, v in _valid_payload(db_session).items() if k != "description"}
    response = client.post("/outage-reports", json=payload)

    assert response.status_code == 201
    assert response.json()["description"] is None


def test_create_outage_report_invalid_equipment_id_returns_422(
    client: TestClient, db_session: Session
) -> None:
    payload = {**_valid_payload(db_session), "equipment_id": 9999}
    response = client.post("/outage-reports", json=payload)

    assert response.status_code == 422


def test_create_outage_report_missing_required_field_returns_422(
    client: TestClient, db_session: Session
) -> None:
    payload = {k: v for k, v in _valid_payload(db_session).items() if k != "equipment_id"}
    response = client.post("/outage-reports", json=payload)

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# GET /outage-reports
# ---------------------------------------------------------------------------


def test_list_outage_reports_empty(client: TestClient) -> None:
    response = client.get("/outage-reports")

    assert response.status_code == 200
    assert response.json() == []


def test_list_outage_reports_returns_all(client: TestClient, db_session: Session) -> None:
    _create_report(db_session)
    _create_report(db_session, station="Waterloo")

    response = client.get("/outage-reports")

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_list_outage_reports_ordered_newest_first(
    client: TestClient, db_session: Session
) -> None:
    older = _create_report(db_session, breakdown_time=datetime(2024, 1, 1, tzinfo=timezone.utc))
    newer = _create_report(db_session, breakdown_time=datetime(2024, 6, 1, tzinfo=timezone.utc))

    response = client.get("/outage-reports")
    ids = [r["id"] for r in response.json()]

    assert ids == [newer.id, older.id]


def test_list_outage_reports_excludes_soft_deleted(
    client: TestClient, db_session: Session
) -> None:
    r1 = _create_report(db_session)
    _create_report(db_session, station="Waterloo")

    client.delete(f"/outage-reports/{r1.id}")

    response = client.get("/outage-reports")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] != r1.id


# ---------------------------------------------------------------------------
# GET /outage-reports/{report_id}
# ---------------------------------------------------------------------------


def test_get_outage_report_returns_report(client: TestClient, db_session: Session) -> None:
    report = _create_report(db_session)

    response = client.get(f"/outage-reports/{report.id}")

    assert response.status_code == 200
    assert response.json()["id"] == report.id


def test_get_outage_report_missing_returns_404(client: TestClient) -> None:
    response = client.get("/outage-reports/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Outage report not found"}


def test_get_outage_report_deleted_returns_404(
    client: TestClient, db_session: Session
) -> None:
    report = _create_report(db_session)
    client.delete(f"/outage-reports/{report.id}")

    response = client.get(f"/outage-reports/{report.id}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Outage report not found"}


# ---------------------------------------------------------------------------
# DELETE /outage-reports/{report_id}
# ---------------------------------------------------------------------------


def test_delete_outage_report_returns_204(client: TestClient, db_session: Session) -> None:
    report = _create_report(db_session)

    response = client.delete(f"/outage-reports/{report.id}")

    assert response.status_code == 204


def test_delete_outage_report_does_not_remove_row(
    client: TestClient, db_session: Session
) -> None:
    report = _create_report(db_session)

    client.delete(f"/outage-reports/{report.id}")

    assert db_session.get(OutageReport, report.id) is not None


def test_delete_outage_report_creates_deletion_record(
    client: TestClient, db_session: Session
) -> None:
    report = _create_report(db_session)

    client.delete(f"/outage-reports/{report.id}")

    deletion = (
        db_session.query(OutageReportDeletion).filter_by(report_id=report.id).one_or_none()
    )
    assert deletion is not None
    assert deletion.deleted_at is not None


def test_delete_outage_report_missing_returns_404(client: TestClient) -> None:
    response = client.delete("/outage-reports/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Outage report not found"}


def test_delete_outage_report_twice_returns_404(
    client: TestClient, db_session: Session
) -> None:
    report = _create_report(db_session)
    client.delete(f"/outage-reports/{report.id}")

    response = client.delete(f"/outage-reports/{report.id}")

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POST /outage-reports/{report_id}/image
# ---------------------------------------------------------------------------

_TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00"
    b"\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18"
    b"\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"
)


def test_upload_image_returns_updated_report(client: TestClient, db_session: Session) -> None:
    report = _create_report(db_session)

    response = client.post(
        f"/outage-reports/{report.id}/image",
        files={"file": ("photo.png", _TINY_PNG, "image/png")},
    )

    assert response.status_code == 200
    assert response.json()["image_content_type"] == "image/png"


def test_upload_image_replaces_existing_image(client: TestClient, db_session: Session) -> None:
    report = _create_report(db_session)
    client.post(
        f"/outage-reports/{report.id}/image",
        files={"file": ("old.png", _TINY_PNG, "image/png")},
    )

    tiny_jpeg = b"\xff\xd8\xff\xd9"
    response = client.post(
        f"/outage-reports/{report.id}/image",
        files={"file": ("new.jpg", tiny_jpeg, "image/jpeg")},
    )

    assert response.status_code == 200
    assert response.json()["image_content_type"] == "image/jpeg"


def test_upload_image_missing_report_returns_404(client: TestClient) -> None:
    response = client.post(
        "/outage-reports/999/image",
        files={"file": ("photo.png", _TINY_PNG, "image/png")},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Outage report not found"}


def test_upload_image_deleted_report_returns_404(
    client: TestClient, db_session: Session
) -> None:
    report = _create_report(db_session)
    client.delete(f"/outage-reports/{report.id}")

    response = client.post(
        f"/outage-reports/{report.id}/image",
        files={"file": ("photo.png", _TINY_PNG, "image/png")},
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Outage report not found"}


@pytest.mark.parametrize("content_type", ["image/tiff", "application/pdf", "text/plain"])
def test_upload_image_unsupported_type_returns_415(
    client: TestClient, db_session: Session, content_type: str
) -> None:
    report = _create_report(db_session)

    response = client.post(
        f"/outage-reports/{report.id}/image",
        files={"file": ("file", b"data", content_type)},
    )

    assert response.status_code == 415


# ---------------------------------------------------------------------------
# GET /outage-reports/{report_id}/image
# ---------------------------------------------------------------------------


def test_download_image_returns_bytes(client: TestClient, db_session: Session) -> None:
    report = _create_report(db_session)
    client.post(
        f"/outage-reports/{report.id}/image",
        files={"file": ("photo.png", _TINY_PNG, "image/png")},
    )

    response = client.get(f"/outage-reports/{report.id}/image")

    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == _TINY_PNG


def test_download_image_missing_report_returns_404(client: TestClient) -> None:
    response = client.get("/outage-reports/999/image")

    assert response.status_code == 404
    assert response.json() == {"detail": "Outage report not found"}


def test_download_image_deleted_report_returns_404(
    client: TestClient, db_session: Session
) -> None:
    report = _create_report(db_session)
    client.post(
        f"/outage-reports/{report.id}/image",
        files={"file": ("photo.png", _TINY_PNG, "image/png")},
    )
    client.delete(f"/outage-reports/{report.id}")

    response = client.get(f"/outage-reports/{report.id}/image")

    assert response.status_code == 404
    assert response.json() == {"detail": "Outage report not found"}


def test_download_image_no_image_attached_returns_404(
    client: TestClient, db_session: Session
) -> None:
    report = _create_report(db_session)

    response = client.get(f"/outage-reports/{report.id}/image")

    assert response.status_code == 404
    assert response.json() == {"detail": "No image attached to this outage report"}
