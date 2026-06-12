from fastapi import APIRouter, Depends, Request, Response

from app.http_cache import reference_response
from app.repositories.equipment import EquipmentRepository, get_equipment_repo
from app.schemas.equipment import EquipmentSummary

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentSummary])
def list_equipment(
    request: Request,
    response: Response,
    station_id: int | None = None,
    repo: EquipmentRepository = Depends(get_equipment_repo),
):
    """Return all equipment, optionally filtered by station_id."""
    items = repo.list_all(station_id=station_id)
    # Only the full, unfiltered list is ETag-cached; per-station results are returned plain.
    if station_id is None:
        return reference_response(request, response, items, "equipment") or items
    return items
