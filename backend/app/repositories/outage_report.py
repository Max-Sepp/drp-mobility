from datetime import datetime, timezone

from fastapi import Depends
from sqlalchemy import exists
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.equipment import Equipment
from app.models.failure import Failure
from app.models.outage_report import OutageReport
from app.models.outage_report_deletion import OutageReportDeletion
from app.schemas.outage_report import OutageReportCreate

# Excludes reports that have a corresponding OutageReportDeletion row (soft-deleted).
_ACTIVE_FILTER = ~exists().where(OutageReportDeletion.report_id == OutageReport.id)

_REPORT_JOINEDLOAD = [
    joinedload(OutageReport.failure)
    .joinedload(Failure.equipment)
    .joinedload(Equipment.station),
    joinedload(OutageReport.failure)
    .joinedload(Failure.equipment)
    .joinedload(Equipment.equipment_type),
]


class OutageReportRepository:
    """Data access for OutageReport rows, including soft-delete and image attachment."""

    def __init__(self, db: Session) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def get(self, report_id: int) -> OutageReport | None:
        """Fetch a report by id regardless of soft-deletion state."""
        return self._db.get(OutageReport, report_id)

    def get_active(self, report_id: int) -> OutageReport | None:
        """Fetch a non-deleted report with its failure/equipment/station eagerly loaded."""
        return (
            self._db.query(OutageReport)
            .options(*_REPORT_JOINEDLOAD)
            .filter(OutageReport.id == report_id, _ACTIVE_FILTER)
            .one_or_none()
        )

    def list_all(self) -> list[OutageReport]:
        """List active reports newest first, with related rows eagerly loaded."""
        return (
            self._db.query(OutageReport)
            .options(*_REPORT_JOINEDLOAD)
            .filter(_ACTIVE_FILTER)
            .order_by(OutageReport.breakdown_time.desc())
            .all()
        )

    def is_deleted(self, report_id: int) -> bool:
        """True if a soft-deletion record exists for this report id."""
        return self._db.query(
            exists().where(OutageReportDeletion.report_id == report_id)
        ).scalar()

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    def create(self, payload: OutageReportCreate) -> OutageReport:
        """Persist a new report, attaching it to the equipment's open Failure (creating one if needed)."""
        if self._db.get(Equipment, payload.equipment_id) is None:
            raise ValueError(f"equipment_id {payload.equipment_id} not found")

        failure = self._find_or_create_failure(payload.equipment_id)

        report = OutageReport(
            failure_id=failure.id,
            breakdown_time=payload.breakdown_time,
            description=payload.description,
        )
        self._db.add(report)
        self._db.commit()
        return self.get_active(report.id)

    def soft_delete(self, report: OutageReport, reason: str | None = None) -> None:
        """Mark a report as deleted by inserting an OutageReportDeletion row; the report itself is preserved."""
        deletion = OutageReportDeletion(
            report_id=report.id,
            deleted_at=datetime.now(tz=timezone.utc),
            reason=reason,
        )
        self._db.add(deletion)
        self._db.commit()

    def set_image(self, report: OutageReport, image: bytes, content_type: str) -> OutageReport:
        """Attach or replace the image bytes stored on a report row."""
        report.image = image
        report.image_content_type = content_type
        self._db.commit()
        self._db.refresh(report)
        return self.get_active(report.id)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _find_or_create_failure(self, equipment_id: int) -> Failure:
        """Return the equipment's currently-open Failure, creating one if all prior failures are resolved.

        At most one unresolved Failure per equipment is enforced by a partial unique index. Because
        this is a read-then-insert, two concurrent reports for the same equipment can both miss the
        SELECT and try to INSERT a Failure; the index makes the loser's INSERT raise IntegrityError.
        We catch that, roll back the failed insert, and re-read the open failure the winner committed
        so both reports end up grouped under the same Failure.
        """
        failure = self._find_open_failure(equipment_id)
        if failure is not None:
            return failure

        failure = Failure(equipment_id=equipment_id)
        self._db.add(failure)
        try:
            self._db.flush()
        except IntegrityError:
            self._db.rollback()
            failure = self._find_open_failure(equipment_id)
            if failure is None:
                # The conflict was not the open-failure index (e.g. a real error), so re-raise.
                raise
        return failure

    def _find_open_failure(self, equipment_id: int) -> Failure | None:
        """Return the equipment's single unresolved Failure, or None if all are resolved."""
        return (
            self._db.query(Failure)
            .filter_by(equipment_id=equipment_id, resolved=False)
            .first()
        )


def get_repo(db: Session = Depends(get_db)) -> OutageReportRepository:
    """FastAPI dependency that yields a session-scoped OutageReportRepository."""
    return OutageReportRepository(db)
