from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.saved_journey import SavedJourneyRepository, get_saved_journey_repo
from app.schemas.saved_journey import SavedJourneyCreate, SavedJourneyOut

router = APIRouter(prefix="/journeys", tags=["journeys"])


@router.get("", response_model=list[SavedJourneyOut])
def list_journeys(
    current_user: User = Depends(get_current_user),
    repo: SavedJourneyRepository = Depends(get_saved_journey_repo),
) -> list[SavedJourneyOut]:
    """Return the authenticated user's saved journeys, newest first."""
    return repo.list_for_user(current_user.id)


@router.post("", response_model=SavedJourneyOut, status_code=201)
def save_journey(
    payload: SavedJourneyCreate,
    current_user: User = Depends(get_current_user),
    repo: SavedJourneyRepository = Depends(get_saved_journey_repo),
) -> SavedJourneyOut:
    """Save a journey snapshot for the authenticated user."""
    return repo.create(current_user.id, payload)


@router.delete("/{journey_id}", status_code=204)
def delete_journey(
    journey_id: str,
    current_user: User = Depends(get_current_user),
    repo: SavedJourneyRepository = Depends(get_saved_journey_repo),
) -> None:
    """Remove a saved journey belonging to the authenticated user."""
    if not repo.delete(current_user.id, journey_id):
        raise HTTPException(status_code=404, detail="Journey not found")
