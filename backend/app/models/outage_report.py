from datetime import datetime

from sqlalchemy import ForeignKey, LargeBinary, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.user import UserRole


class OutageReport(Base):
    """A user-submitted report that a piece of equipment is broken, attached to a Failure."""

    __tablename__ = "outage_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    failure_id: Mapped[int] = mapped_column(ForeignKey("failures.id"), index=True)
    breakdown_time: Mapped[datetime] = mapped_column()
    description: Mapped[str | None] = mapped_column(Text, default=None)
    image: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
    image_content_type: Mapped[str | None] = mapped_column(default=None)
    # The role of whoever submitted this report (anonymous submissions are untrusted). Reports are
    # not linked to a specific user — only this role is copied over at creation time.
    reporter_role: Mapped[str] = mapped_column(default=UserRole.UNTRUSTED.value)
    # Provenance of this report: "user" for app submissions, "tfl" for rows synthesised by the
    # TfL disruption poller (see services/tfl_ingest.py). The automated "tfl" source ranks below
    # a trusted human — see FailureRepository.resolve / resolved_authoritative.
    source: Mapped[str] = mapped_column(default="user")
    # Stable TfL disruption id for poller-created reports; lets re-polls dedupe and lets clears be
    # reconciled. Indexed but deliberately *not* unique: a cleared-then-recurring disruption may
    # reuse the same id and must be able to open a fresh failure.
    external_ref: Mapped[str | None] = mapped_column(index=True, default=None)

    failure: Mapped["Failure"] = relationship("Failure", back_populates="reports")
    deletion: Mapped["OutageReportDeletion | None"] = relationship(
        "OutageReportDeletion", back_populates="report", uselist=False
    )
