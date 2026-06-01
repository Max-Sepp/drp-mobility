from datetime import datetime

from sqlalchemy import ForeignKey, LargeBinary, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OutageReport(Base):
    """A user-submitted report that a piece of equipment is broken, attached to a Failure."""

    __tablename__ = "outage_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    failure_id: Mapped[int] = mapped_column(ForeignKey("failures.id"), index=True)
    breakdown_time: Mapped[datetime] = mapped_column()
    description: Mapped[str | None] = mapped_column(Text, default=None)
    image: Mapped[bytes | None] = mapped_column(LargeBinary, default=None)
    image_content_type: Mapped[str | None] = mapped_column(default=None)

    failure: Mapped["Failure"] = relationship("Failure", back_populates="reports")
    deletion: Mapped["OutageReportDeletion | None"] = relationship(
        "OutageReportDeletion", back_populates="report", uselist=False
    )
