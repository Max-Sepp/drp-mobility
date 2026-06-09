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
from app.models.user import UserRole
from app.schemas.outage_report import OutageReportCreate

# Excludes reports that have a corresponding OutageReportDeletion row (soft-deleted).
_ACTIVE_FILTER = ~exists().where(OutageReportDeletion.report_id == OutageReport.id)

_REPORT_JOINEDLOAD = [
    joinedload(OutageReport.failure).joinedload(Failure.equipment).joinedload(Equipment.station),
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

    def list_active_open(self) -> list[OutageReport]:
        """List active reports under unresolved failures, newest first.

        This is the "currently-open feed": it drops both soft-deleted reports and reports whose
        failure has been resolved. Used to seed the SSE stream's initial snapshot.
        """
        return (
            self._db.query(OutageReport)
            .join(Failure, OutageReport.failure_id == Failure.id)
            .options(*_REPORT_JOINEDLOAD)
            .filter(Failure.resolved.is_(False), _ACTIVE_FILTER)
            .order_by(OutageReport.breakdown_time.desc())
            .all()
        )

    def is_deleted(self, report_id: int) -> bool:
        """True if a soft-deletion record exists for this report id."""
        return self._db.query(exists().where(OutageReportDeletion.report_id == report_id)).scalar()

    # ------------------------------------------------------------------
    # TfL ingest queries
    # ------------------------------------------------------------------

    def find_open_tfl_report(self, external_ref: str) -> OutageReport | None:
        """Return an active TfL report with this disruption id under an *open* failure.

        Used by the poller to dedupe: if one exists, the disruption is already recorded and we
        skip creating another report for this poll cycle."""
        return (
            self._db.query(OutageReport)
            .join(Failure, OutageReport.failure_id == Failure.id)
            .filter(
                OutageReport.source == "tfl",
                OutageReport.external_ref == external_ref,
                Failure.resolved.is_(False),
                _ACTIVE_FILTER,
            )
            .first()
        )

    def list_open_tfl_reports(self) -> list[OutageReport]:
        """Return all active TfL reports under unresolved failures (drives clear reconciliation)."""
        return (
            self._db.query(OutageReport)
            .join(Failure, OutageReport.failure_id == Failure.id)
            .filter(
                OutageReport.source == "tfl",
                Failure.resolved.is_(False),
                _ACTIVE_FILTER,
            )
            .all()
        )

    def is_ref_authoritatively_resolved(self, external_ref: str) -> bool:
        """True if any report with this disruption id sits under a failure a trusted human closed.

        The poller checks this before creating a report so a human-closed issue is never reopened,
        even while TfL's feed still reports it."""
        return self._db.query(
            exists().where(
                OutageReport.external_ref == external_ref,
                OutageReport.failure_id == Failure.id,
                Failure.resolved_authoritative.is_(True),
            )
        ).scalar()

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------

    def create(
        self, payload: OutageReportCreate, reporter_role: str = UserRole.UNTRUSTED.value
    ) -> tuple["OutageReport", int | None]:
        """Persist a new report, attaching it to the equipment's open Failure
        (creating one if needed).

        Returns ``(report, new_failure_id)`` where ``new_failure_id`` is the id of the
        newly-created Failure when this is the *first* report for this equipment's current
        incident, or ``None`` when the report was appended to an existing open Failure."""
        if self._db.get(Equipment, payload.equipment_id) is None:
            raise ValueError(f"equipment_id {payload.equipment_id} not found")

        failure, is_new_failure = self._find_or_create_failure(payload.equipment_id)
        new_failure_id: int | None = failure.id if is_new_failure else None

        report = OutageReport(
            failure_id=failure.id,
            breakdown_time=payload.breakdown_time,
            description=payload.description,
            reporter_role=reporter_role,
        )
        self._db.add(report)
        self._db.commit()
        return self.get_active(report.id), new_failure_id

    def create_tfl(
        self,
        equipment_id: int,
        breakdown_time: datetime,
        external_ref: str,
        description: str | None = None,
    ) -> tuple["OutageReport", int | None]:
        """Persist a report synthesised from TfL's official feed.

        Like ``create`` but tagged ``source="tfl"``, pre-verified, and stamped with the upstream
        disruption id so re-polls can dedupe and clears can be reconciled. Returns
        ``(report, new_failure_id)`` with the same semantics as ``create``."""
        if self._db.get(Equipment, equipment_id) is None:
            raise ValueError(f"equipment_id {equipment_id} not found")

        failure, is_new_failure = self._find_or_create_failure(equipment_id)
        new_failure_id: int | None = failure.id if is_new_failure else None

        report = OutageReport(
            failure_id=failure.id,
            breakdown_time=breakdown_time,
            description=description,
            reporter_role=UserRole.TFL.value,
            verified=True,
            source="tfl",
            external_ref=external_ref,
        )
        self._db.add(report)
        self._db.commit()
        return self.get_active(report.id), new_failure_id

    def soft_delete(self, report: OutageReport, reason: str | None = None) -> None:
        """Mark a report as deleted by inserting an OutageReportDeletion row; the report
        itself is preserved."""
        deletion = OutageReportDeletion(
            report_id=report.id,
            deleted_at=datetime.now(tz=timezone.utc),
            reason=reason,
        )
        self._db.add(deletion)
        self._db.commit()

    def verify(self, report: OutageReport) -> OutageReport:
        """Mark a report as verified by a trusted worker. Idempotent."""
        report.verified = True
        self._db.commit()
        self._db.refresh(report)
        return self.get_active(report.id)

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

    def _find_or_create_failure(self, equipment_id: int) -> tuple[Failure, bool]:
        """Return the equipment's currently-open Failure, creating one if all prior
        failures are resolved.

        Returns ``(failure, is_new)`` — ``is_new`` is True only when *this call* inserted the
        Failure row (not when it raced and recovered an existing one).

        At most one unresolved Failure per equipment is enforced by a partial unique index. Because
        this is a read-then-insert, two concurrent reports for the same equipment can both miss the
        SELECT and try to INSERT a Failure; the index makes the loser's INSERT raise IntegrityError.
        We catch that, roll back the failed insert, and re-read the open failure the
        winner committed so both reports end up grouped under the same Failure.
        """
        failure = self._find_open_failure(equipment_id)
        if failure is not None:
            return failure, False

        failure = Failure(equipment_id=equipment_id)
        self._db.add(failure)
        try:
            self._db.flush()
            return failure, True
        except IntegrityError:
            self._db.rollback()
            failure = self._find_open_failure(equipment_id)
            if failure is None:
                # The conflict was not the open-failure index (e.g. a real error), so re-raise.
                raise
            return failure, False

    def _find_open_failure(self, equipment_id: int) -> Failure | None:
        """Return the equipment's single unresolved Failure, or None if all are resolved."""
        return self._db.query(Failure).filter_by(equipment_id=equipment_id, resolved=False).first()


def get_repo(db: Session = Depends(get_db)) -> OutageReportRepository:
    """FastAPI dependency that yields a session-scoped OutageReportRepository."""
    return OutageReportRepository(db)
