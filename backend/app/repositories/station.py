from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.station import Station
from app.repositories.cache import cached_list
from app.schemas.station import StationSchema


class StationRepository:
    """Read-only access to the Station reference table, cached in-process."""

    def __init__(self, db: Session) -> None:
        self._db = db

    @cached_list
    def list_all(self) -> list[StationSchema]:
        """Return all stations ordered by name (cached after the first call)."""
        rows = self._db.query(Station).order_by(Station.name).all()
        return [StationSchema.model_validate(s) for s in rows]


def get_station_repo(db: Session = Depends(get_db)) -> StationRepository:
    """FastAPI dependency that yields a session-scoped StationRepository."""
    return StationRepository(db)
