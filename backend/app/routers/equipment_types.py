from fastapi import APIRouter, Depends, Request, Response

from app.http_cache import reference_response
from app.repositories.equipment_type import EquipmentTypeRepository, get_equipment_type_repo
from app.schemas.equipment_type import EquipmentTypeSchema

router = APIRouter(prefix="/equipment-types", tags=["equipment-types"])


@router.get("", response_model=list[EquipmentTypeSchema])
def list_equipment_types(
    request: Request,
    response: Response,
    repo: EquipmentTypeRepository = Depends(get_equipment_type_repo),
):
    """Return all available equipment types."""
    items = repo.list_all()
    return reference_response(request, response, items, "equipment-types") or items
