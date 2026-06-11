import enum

from sqlalchemy import Boolean, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.platform import Platform, PlatformStepFree


class StepFree(str, enum.Enum):
    """A station's step-free accessibility, as published by TfL.

    Ordered weakest-to-strongest: no step-free access, step-free from street to platform
    only, and step-free all the way from street onto the train.
    """

    NONE = "none"
    TO_PLATFORM = "to_platform"
    TO_VEHICLE = "to_vehicle"


# How a single platform's access maps onto the coarser station scale. A platform that is
# step-free onto the train ("to_train"/"full") makes the station step-free to the vehicle.
_PLATFORM_TO_STATION: dict[PlatformStepFree, StepFree] = {
    PlatformStepFree.NONE: StepFree.NONE,
    PlatformStepFree.TO_PLATFORM: StepFree.TO_PLATFORM,
    PlatformStepFree.TO_TRAIN: StepFree.TO_VEHICLE,
    PlatformStepFree.FULL: StepFree.TO_VEHICLE,
}
# Weakest-to-strongest ordering used to pick the best access across a station's platforms.
_STATION_RANK: dict[StepFree, int] = {
    StepFree.NONE: 0,
    StepFree.TO_PLATFORM: 1,
    StepFree.TO_VEHICLE: 2,
}


class Station(Base):
    """A transit station that equipment (lifts, escalators, etc.) belongs to."""

    __tablename__ = "stations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(unique=True)
    # TfL NaPTAN/HUB code from stations.json ("id"), e.g. "940GZZLUMDN". Lets the TfL disruption
    # poller map a feed's stationUniqueId straight to our row. Nullable for any legacy/unmatched
    # seed entries.
    tfl_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True, default=None)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    wifi: Mapped[bool] = mapped_column(Boolean, default=False)
    zones: Mapped[str | None] = mapped_column(String, nullable=True)
    has_toilets: Mapped[bool] = mapped_column(Boolean, default=False)
    has_accessible_toilets: Mapped[bool] = mapped_column(Boolean, default=False)
    blue_badge_parking: Mapped[bool] = mapped_column(Boolean, default=False)
    taxi_rank: Mapped[bool] = mapped_column(Boolean, default=False)

    platforms: Mapped[list[Platform]] = relationship(Platform, back_populates="station")

    @property
    def step_free(self) -> StepFree:
        """Step-free access for the station, derived as the strongest access any of its
        platforms offers (NONE when it has no platforms)."""
        best = StepFree.NONE
        for platform in self.platforms:
            candidate = _PLATFORM_TO_STATION[platform.step_free]
            if _STATION_RANK[candidate] > _STATION_RANK[best]:
                best = candidate
        return best
