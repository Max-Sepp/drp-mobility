import enum

from sqlalchemy import JSON, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
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
    # Compass direction of travel from this platform (e.g. "Eastbound"). Null when unknown.
    direction: Mapped[str | None] = mapped_column(String, nullable=True)
    # Step-free walking distances to other platforms at the same station, as stored in
    # stations.json: a list of { "to": "<platform name>", "distanceM": <int> }. Lets the client
    # reason about which platforms a stranded rider can reach step-free (other direction / line).
    interchange_to: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # Names of other platforms at this station reachable from this one *at the same level*
    # (no lift or ramp involved), as stored in stations.json: a list of platform name
    # strings. Unlike `interchange_to`, this set is lift-independent, so it is what a
    # rider stranded by a broken lift can actually still reach.
    same_level_platforms: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # A station has at most one platform of a given name.
    __table_args__ = (UniqueConstraint("station_id", "name"),)

    station: Mapped["Station"] = relationship("Station", back_populates="platforms")
    # The line(s) this platform serves. Empty when unknown.
    lines: Mapped[list[Line]] = relationship(secondary=platform_lines)
