from fastapi import APIRouter, Depends

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.saved_place import SavedPlaceRepository, get_saved_place_repo
from app.schemas.saved_place import SavedPlacesIn, SavedPlacesOut

router = APIRouter(prefix="/users/me/saved-places", tags=["saved-places"])


@router.get("", response_model=SavedPlacesOut)
def get_saved_places(
    current_user: User = Depends(get_current_user),
    repo: SavedPlaceRepository = Depends(get_saved_place_repo),
) -> SavedPlacesOut:
    """Return the authenticated user's saved places (home, work, custom)."""
    return repo.get_for_user(current_user.id)


@router.put("", response_model=SavedPlacesOut)
def put_saved_places(
    places: SavedPlacesIn,
    current_user: User = Depends(get_current_user),
    repo: SavedPlaceRepository = Depends(get_saved_place_repo),
) -> SavedPlacesOut:
    """Replace the authenticated user's full set of saved places in a single atomic write.

    Replaces home, work, and all custom places at once — the caller sends the complete
    desired state and the backend overwrites the previous state. This keeps the API surface
    minimal (two endpoints instead of five) and matches the frontend's read-modify-write flow.
    """
    return repo.replace_for_user(current_user.id, places)
