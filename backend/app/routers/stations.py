from fastapi import APIRouter, Depends

from app.repositories.station import StationRepository, get_station_repo
from app.schemas.station import StationDetail

router = APIRouter(prefix="/stations", tags=["stations"])


@router.get("", response_model=list[StationDetail])
def list_stations(repo: StationRepository = Depends(get_station_repo)) -> list[StationDetail]:
    """Return all available stations, each with its platforms and per-platform step-free access."""
    return repo.list_all()
