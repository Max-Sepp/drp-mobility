from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.saved_journey import SavedJourney
from app.schemas.saved_journey import SavedJourneyCreate


class SavedJourneyRepository:
    """Data access for SavedJourney rows scoped to a specific user."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def list_for_user(self, user_id: int) -> list[SavedJourney]:
        """Return all journeys for a user, newest first."""
        return (
            self._db.query(SavedJourney)
            .filter_by(user_id=user_id)
            .order_by(SavedJourney.saved_at.desc())
            .all()
        )

    def create(self, user_id: int, payload: SavedJourneyCreate) -> SavedJourney:
        """Persist a new journey snapshot. Idempotent: if the id already exists the
        existing row is returned unchanged, protecting against duplicate POSTs on retry."""
        existing = self._db.get(SavedJourney, payload.id)
        if existing is not None:
            return existing
        journey = SavedJourney(
            id=payload.id,
            user_id=user_id,
            saved_at=payload.saved_at,
            payload=payload.payload,
        )
        self._db.add(journey)
        self._db.commit()
        return journey

    def delete(self, user_id: int, journey_id: str) -> bool:
        """Delete a journey. Returns False if it does not exist or belongs to a different user."""
        journey = self._db.get(SavedJourney, journey_id)
        if journey is None or journey.user_id != user_id:
            return False
        self._db.delete(journey)
        self._db.commit()
        return True


def get_saved_journey_repo(db: Session = Depends(get_db)) -> SavedJourneyRepository:
    """FastAPI dependency that yields a session-scoped SavedJourneyRepository."""
    return SavedJourneyRepository(db)
