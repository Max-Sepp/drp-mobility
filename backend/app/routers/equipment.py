from fastapi import APIRouter, Depends

from app.repositories.equipment import EquipmentRepository, get_equipment_repo
from app.schemas.equipment import EquipmentSummary

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentSummary])
def list_equipment(
    station_id: int | None = None,
    repo: EquipmentRepository = Depends(get_equipment_repo),
) -> list[EquipmentSummary]:
    """Return all equipment, optionally filtered by station_id."""
    return repo.list_all(station_id=station_id)
