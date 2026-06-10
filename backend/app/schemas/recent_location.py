from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RecentLocationCreate(BaseModel):
    label: str
    postcode: str | None = None


class RecentLocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    postcode: str | None
    searched_at: datetime
