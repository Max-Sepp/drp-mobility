from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Equipment(Base):
    """A specific physical piece of equipment installed at a station (one lift, one escalator)."""

    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    equipment_type_id: Mapped[int] = mapped_column(ForeignKey("equipment_types.id"), index=True)
    # Human-readable description of what this unit connects (e.g. "Platform 2 → Street").
    connection: Mapped[str] = mapped_column()

    # A station has at most one piece of equipment of a given type serving a given connection.
    __table_args__ = (UniqueConstraint("station_id", "equipment_type_id", "connection"),)

    station: Mapped["Station"] = relationship("Station")
    equipment_type: Mapped["EquipmentType"] = relationship("EquipmentType")
    failures: Mapped[list["Failure"]] = relationship("Failure", back_populates="equipment")
