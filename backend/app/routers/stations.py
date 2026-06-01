from fastapi import APIRouter, Depends

from app.repositories.station import StationRepository, get_station_repo
from app.schemas.station import StationSchema

router = APIRouter(prefix="/stations", tags=["stations"])


@router.get("", response_model=list[StationSchema])
def list_stations(repo: StationRepository = Depends(get_station_repo)) -> list[StationSchema]:
    """Return all available stations."""
    return repo.list_all()
