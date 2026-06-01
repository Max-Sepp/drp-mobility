from pydantic import BaseModel, ConfigDict


class StationSchema(BaseModel):
    """Public representation of a Station row."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
