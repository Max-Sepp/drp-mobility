from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Station(Base):
    """A transit station that equipment (lifts, escalators, etc.) belongs to."""

    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
