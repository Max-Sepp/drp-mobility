from fastapi import Depends
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.equipment import Equipment
from app.models.platform import Platform
from app.models.station import Station
from app.repositories.cache import cached_list
from app.schemas.station import StationDetail


class StationRepository:
    """Read-only access to the Station reference table, cached in-process."""

    def __init__(self, db: Session) -> None:
        self._db = db

    @cached_list
    def list_all(self) -> list[StationDetail]:
        """Return all stations (with their platforms) ordered by name, cached after the
        first call."""
        # Eager-load platforms and their lines so the derived step_free and the platform
        # breakdown don't trigger per-station queries while serialising.
        rows = (
            self._db.query(Station)
            .options(
                selectinload(Station.platforms).selectinload(Platform.lines),
                selectinload(Station.equipment).selectinload(Equipment.equipment_type),
            )
            .order_by(Station.name)
            .all()
        )
        return [StationDetail.model_validate(s) for s in rows]


def get_station_repo(db: Session = Depends(get_db)) -> StationRepository:
    """FastAPI dependency that yields a session-scoped StationRepository."""
    return StationRepository(db)
