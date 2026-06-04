from datetime import datetime, timezone

from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.push_token import PushToken
from app.models.saved_journey import SavedJourney


class PushTokenRepository:
    """Data access for Expo push tokens. One row per device; a user may have several."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def tokens_with_saved_journeys(self) -> list[tuple[str, int, str]]:
        """Return ``(token, user_id, journey_payload)`` for every push token whose owner has at
        least one saved journey. A user with multiple tokens and/or journeys yields one row per
        (token, journey) pair — callers group by user as needed."""
        return (
            self._db.query(PushToken.token, PushToken.user_id, SavedJourney.payload)
            .join(SavedJourney, SavedJourney.user_id == PushToken.user_id)
            .all()
        )

    def delete_by_tokens(self, tokens: list[str]) -> None:
        """Bulk-delete the given token rows (used to prune tokens Expo reports as unregistered)."""
        if not tokens:
            return
        self._db.query(PushToken).filter(PushToken.token.in_(tokens)).delete(
            synchronize_session=False
        )
        self._db.commit()

    def upsert(self, user_id: int, token: str) -> None:
        """Register a push token for a user.

        Idempotent: re-registering the same token for the same user is a no-op. If the token is
        already registered to a *different* user (e.g. an account switch on the same device), it is
        re-assigned to this user."""
        existing = self._db.query(PushToken).filter_by(token=token).one_or_none()
        if existing is None:
            self._db.add(PushToken(user_id=user_id, token=token))
            self._db.commit()
        elif existing.user_id != user_id:
            existing.user_id = user_id
            existing.created_at = datetime.now(tz=timezone.utc)
            self._db.commit()

    def delete_for_user(self, user_id: int, token: str) -> bool:
        """Remove a specific token owned by a user. Returns False if it does not exist or belongs to
        a different user (in which case nothing is deleted)."""
        row = self._db.query(PushToken).filter_by(token=token, user_id=user_id).one_or_none()
        if row is None:
            return False
        self._db.delete(row)
        self._db.commit()
        return True


def get_push_token_repo(db: Session = Depends(get_db)) -> PushTokenRepository:
    """FastAPI dependency that yields a session-scoped PushTokenRepository."""
    return PushTokenRepository(db)
