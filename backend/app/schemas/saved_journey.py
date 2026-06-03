from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SavedJourneyCreate(BaseModel):
    """Request body for POST /journeys."""

    id: str
    saved_at: datetime
    payload: str  # verbatim JSON blob from the frontend


class SavedJourneyOut(BaseModel):
    """A saved journey as returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    saved_at: datetime
    payload: str
