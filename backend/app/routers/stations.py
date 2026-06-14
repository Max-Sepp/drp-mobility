from fastapi import APIRouter, Depends, Request, Response

from app.http_cache import reference_response
from app.repositories.station import StationRepository, get_station_repo
from app.schemas.station import StationDetail

router = APIRouter(prefix="/stations", tags=["stations"])


@router.get("", response_model=list[StationDetail])
def list_stations(
    request: Request, response: Response, repo: StationRepository = Depends(get_station_repo)
):
    """Return all available stations, each with its platforms and per-platform step-free access."""
    items = repo.list_all()
    return reference_response(request, response, items, "stations") or items
