from fastapi import Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.equipment import Equipment
from app.models.equipment_type import EquipmentType
from app.models.station import Station
from app.repositories.cache import cached_list
from app.schemas.equipment import EquipmentSummary


class EquipmentRepository:
    """Read-only access to Equipment with its Station and EquipmentType eagerly loaded."""

    def __init__(self, db: Session) -> None:
        self._db = db

    @cached_list
    def _all(self) -> list[EquipmentSummary]:
        rows = (
            self._db.query(Equipment)
            .options(
                joinedload(Equipment.station),
                joinedload(Equipment.equipment_type),
            )
            .join(Equipment.station)
            .join(Equipment.equipment_type)
            .order_by(Station.name, EquipmentType.name, Equipment.connection)
            .all()
        )
        return [EquipmentSummary.model_validate(e) for e in rows]

    def list_all(self, station_id: int | None = None) -> list[EquipmentSummary]:
        """Return all equipment (optionally filtered to one station), ordered by station / type / connection."""
        all_equipment = self._all()
        if station_id is not None:
            return [e for e in all_equipment if e.station.id == station_id]
        return all_equipment


def get_equipment_repo(db: Session = Depends(get_db)) -> EquipmentRepository:
    """FastAPI dependency that yields a session-scoped EquipmentRepository."""
    return EquipmentRepository(db)
