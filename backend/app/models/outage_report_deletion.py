from datetime import datetime

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OutageReportDeletion(Base):
    """Soft-deletion record for an OutageReport, preserving an audit trail of why it was removed."""

    __tablename__ = "outage_report_deletions"

    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("outage_reports.id"), unique=True)
    deleted_at: Mapped[datetime] = mapped_column()
    reason: Mapped[str | None] = mapped_column(Text, default=None)

    report: Mapped["OutageReport"] = relationship("OutageReport", back_populates="deletion")
