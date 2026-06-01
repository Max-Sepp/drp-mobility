from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Failure(Base):
    """A single outage of a piece of equipment, aggregating one or more user reports until resolved."""

    __tablename__ = "failures"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), index=True)
    resolved: Mapped[bool] = mapped_column(default=False)

    equipment: Mapped["Equipment"] = relationship("Equipment", back_populates="failures")
    reports: Mapped[list["OutageReport"]] = relationship("OutageReport", back_populates="failure")


# Enforce the grouping invariant in the database: at most one *unresolved* failure per equipment.
# This is a partial unique index — only rows where resolved is false are indexed — so any number of
# resolved failures can coexist for the same equipment (sequential outages), while a second open one
# is rejected. It closes the read-then-insert race in OutageReportRepository._find_or_create_failure,
# where two concurrent reports could otherwise both create their own open failure.
# `sqlite_where`/`postgresql_where` cover both the dev/test (SQLite) and production (PostgreSQL) engines.
Index(
    "uq_failures_one_open_per_equipment",
    Failure.equipment_id,
    unique=True,
    sqlite_where=Failure.resolved.is_(False),
    postgresql_where=Failure.resolved.is_(False),
)
