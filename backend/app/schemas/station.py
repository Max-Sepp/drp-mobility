from pydantic import BaseModel, ConfigDict

from app.models.station import StepFree


class StationSchema(BaseModel):
    """Public representation of a Station row."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    step_free: StepFree
