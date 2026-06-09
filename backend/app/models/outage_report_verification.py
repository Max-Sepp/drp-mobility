from datetime import datetime, timezone

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OutageReportVerification(Base):
    """A trusted worker's on-site confirmation that a Failure is real.

    Scoped to the Failure (the outage), not an individual report, and kept anonymised — only
    the time and an optional note are stored, never who verified. Multiple verifications per
    failure are allowed; a Failure is considered verified iff at least one of these rows exists.
    """

    __tablename__ = "outage_report_verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    failure_id: Mapped[int] = mapped_column(ForeignKey("failures.id"), index=True)
    verified_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(tz=timezone.utc))
    description: Mapped[str | None] = mapped_column(Text, default=None)

    failure: Mapped["Failure"] = relationship("Failure", back_populates="verifications")
