from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.station_alert import StationAlertKind
from app.schemas.station import StationSchema


class StationAlertSchema(BaseModel):
    """A station-level accessibility advisory as returned to clients."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    station: StationSchema
    kind: StationAlertKind
    message: str
    source: str
    active: bool
    started_at: datetime
    cleared_at: datetime | None = None
    last_seen_at: datetime
