from pydantic import BaseModel, ConfigDict

from app.models.station import StepFree
from app.schemas.platform import PlatformSchema


class StationSchema(BaseModel):
    """Public representation of a Station row. Kept lean because it is embedded in other
    payloads (e.g. equipment / outage reports); use StationDetail for the platform breakdown."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    step_free: StepFree


class StationDetail(StationSchema):
    """A station plus its platforms, each with their own step-free access and lines.

    `step_free` is the summary derived from these platforms (see Station.step_free)."""

    platforms: list[PlatformSchema]
