from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.recent_location import RecentLocationRepository, get_recent_location_repo
from app.schemas.recent_location import RecentLocationCreate, RecentLocationOut

router = APIRouter(prefix="/users/me/recent-locations", tags=["recent-locations"])


@router.get("", response_model=list[RecentLocationOut])
def list_recent_locations(
    current_user: User = Depends(get_current_user),
    repo: RecentLocationRepository = Depends(get_recent_location_repo),
) -> list[RecentLocationOut]:
    return repo.list_for_user(current_user.id)


@router.post("", response_model=RecentLocationOut, status_code=201)
def add_recent_location(
    payload: RecentLocationCreate,
    current_user: User = Depends(get_current_user),
    repo: RecentLocationRepository = Depends(get_recent_location_repo),
) -> RecentLocationOut:
    return repo.add(current_user.id, payload.label, payload.postcode)
