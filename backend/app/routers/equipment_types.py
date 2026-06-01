from fastapi import APIRouter, Depends

from app.repositories.equipment_type import EquipmentTypeRepository, get_equipment_type_repo
from app.schemas.equipment_type import EquipmentTypeSchema

router = APIRouter(prefix="/equipment-types", tags=["equipment-types"])


@router.get("", response_model=list[EquipmentTypeSchema])
def list_equipment_types(
    repo: EquipmentTypeRepository = Depends(get_equipment_type_repo),
) -> list[EquipmentTypeSchema]:
    """Return all available equipment types."""
    return repo.list_all()
