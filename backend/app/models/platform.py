import enum

from sqlalchemy import Enum as SAEnum
from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.line import Line, platform_lines


class PlatformStepFree(str, enum.Enum):
    """A single platform's step-free accessibility, as published by TfL.

    Ordered weakest-to-strongest. `to_train` and `full` both mean a passenger can board the
    train without a step; TfL labels them differently in the feed so both are preserved.
    """

    NONE = "none"
    TO_PLATFORM = "to_platform"
    TO_TRAIN = "to_train"
    FULL = "full"


class Platform(Base):
    """A platform at a station, identified by the line(s) it serves
    (e.g. "Victoria line — platform 1")."""

    __tablename__ = "platforms"

    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    name: Mapped[str] = mapped_column()
    # This platform's own step-free access. Platforms within one station can differ, so the
    # station's summary value is derived from these (see Station.step_free).
    # Stored as a portable VARCHAR + CHECK (native_enum=False) using the lower-case values.
    step_free: Mapped[PlatformStepFree] = mapped_column(
        SAEnum(PlatformStepFree, native_enum=False, values_callable=lambda e: [m.value for m in e]),
        default=PlatformStepFree.NONE,
    )

    # A station has at most one platform of a given name.
    __table_args__ = (UniqueConstraint("station_id", "name"),)

    station: Mapped["Station"] = relationship("Station", back_populates="platforms")
    # The line(s) this platform serves. Empty when unknown.
    lines: Mapped[list[Line]] = relationship(secondary=platform_lines)
