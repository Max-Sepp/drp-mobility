from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EquipmentType(Base):
    """A category of station equipment (e.g. "lift", "escalator", "ramp")."""

    __tablename__ = "equipment_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
