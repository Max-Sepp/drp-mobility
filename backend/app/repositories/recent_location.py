from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.recent_location import RecentLocation

MAX_RECENTS = 10


class RecentLocationRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def list_for_user(self, user_id: int) -> list[RecentLocation]:
        return (
            self._db.query(RecentLocation)
            .filter_by(user_id=user_id)
            .order_by(RecentLocation.searched_at.desc())
            .limit(MAX_RECENTS)
            .all()
        )

    def add(self, user_id: int, label: str, postcode: str | None) -> RecentLocation:
        # Remove any existing entry with the same label (dedup + move-to-top).
        self._db.query(RecentLocation).filter_by(user_id=user_id, label=label).delete()

        entry = RecentLocation(user_id=user_id, label=label, postcode=postcode)
        self._db.add(entry)
        self._db.flush()

        # Cap at MAX_RECENTS: delete oldest rows beyond the limit.
        ids_to_keep = (
            self._db.query(RecentLocation.id)
            .filter_by(user_id=user_id)
            .order_by(RecentLocation.searched_at.desc())
            .limit(MAX_RECENTS)
            .subquery()
        )
        self._db.query(RecentLocation).filter(
            RecentLocation.user_id == user_id,
            RecentLocation.id.not_in(ids_to_keep),
        ).delete(synchronize_session=False)

        self._db.commit()
        return entry


def get_recent_location_repo(db: Session = Depends(get_db)) -> RecentLocationRepository:
    return RecentLocationRepository(db)
