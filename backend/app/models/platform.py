from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.line import Line, platform_lines


class Platform(Base):
    """A platform at a station, identified by the line(s) it serves (e.g. "Victoria line — platform 1")."""

    __tablename__ = "platforms"

    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    name: Mapped[str] = mapped_column()

    # A station has at most one platform of a given name.
    __table_args__ = (UniqueConstraint("station_id", "name"),)

    station: Mapped["Station"] = relationship("Station")
    # The line(s) this platform serves. Empty when unknown.
    lines: Mapped[list[Line]] = relationship(secondary=platform_lines)
