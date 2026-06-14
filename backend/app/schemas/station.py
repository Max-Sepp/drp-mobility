from pydantic import BaseModel, ConfigDict, field_validator

from app.models.station import StepFree
from app.schemas.platform import PlatformSchema


class StationLift(BaseModel):
    """Minimal lift descriptor — just enough for the client to classify a lift against a journey."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    connection: str


class StationSchema(BaseModel):
    """Public representation of a Station row. Kept lean because it is embedded in other
    payloads (e.g. equipment / outage reports); use StationDetail for the platform breakdown."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    # TfL NaPTAN/StopPoint id (e.g. "940GZZLUMED"). Exposed so the client can plan journeys
    # straight to a station via TfL's Journey Planner, instead of a reverse-geocoded postcode
    # (which lands beside the station and adds a spurious trailing walk). Nullable for any
    # unmatched seed rows.
    tfl_id: str | None = None
    step_free: StepFree


class StationDetail(StationSchema):
    """A station plus its platforms, each with their own step-free access and lines.

    `step_free` is the summary derived from these platforms (see Station.step_free)."""

    latitude: float | None = None
    longitude: float | None = None
    platforms: list[PlatformSchema]
    lifts: list[StationLift] = []
    wifi: bool = False
    zones: list[int] = []
    has_toilets: bool = False
    has_accessible_toilets: bool = False
    blue_badge_parking: bool = False
    taxi_rank: bool = False

    @field_validator("zones", mode="before")
    @classmethod
    def _parse_zones(cls, v: object) -> list[int]:
        if not v:
            return []
        if isinstance(v, list):
            return [int(x) for x in v]
        return [int(x.strip()) for x in str(v).split(",") if x.strip()]
