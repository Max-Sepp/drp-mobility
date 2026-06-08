from fastapi import Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.saved_place import SavedPlace
from app.schemas.saved_place import (
    CustomPlaceSchema,
    SavedPlaceSchema,
    SavedPlacesIn,
    SavedPlacesOut,
)


class SavedPlaceRepository:
    """Data access for SavedPlace rows scoped to a specific user."""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_for_user(self, user_id: int) -> SavedPlacesOut:
        rows = self._db.query(SavedPlace).filter_by(user_id=user_id).all()
        home: SavedPlaceSchema | None = None
        work: SavedPlaceSchema | None = None
        custom: list[CustomPlaceSchema] = []
        for row in rows:
            if row.place_type == "home":
                home = SavedPlaceSchema(address=row.address, postcode=row.postcode)
            elif row.place_type == "work":
                work = SavedPlaceSchema(address=row.address, postcode=row.postcode)
            elif row.place_type == "custom":
                custom.append(
                    CustomPlaceSchema(
                        id=row.client_id or str(row.id),
                        name=row.name or "",
                        icon=row.icon or "",
                        address=row.address,
                        postcode=row.postcode,
                    )
                )
        return SavedPlacesOut(home=home, work=work, custom=custom)

    def replace_for_user(self, user_id: int, places: SavedPlacesIn) -> SavedPlacesOut:
        """Delete all existing rows for the user and insert the new set atomically."""
        self._db.query(SavedPlace).filter_by(user_id=user_id).delete()
        if places.home:
            self._db.add(
                SavedPlace(
                    user_id=user_id,
                    place_type="home",
                    address=places.home.address,
                    postcode=places.home.postcode,
                )
            )
        if places.work:
            self._db.add(
                SavedPlace(
                    user_id=user_id,
                    place_type="work",
                    address=places.work.address,
                    postcode=places.work.postcode,
                )
            )
        for cp in places.custom:
            self._db.add(
                SavedPlace(
                    user_id=user_id,
                    place_type="custom",
                    client_id=cp.id,
                    name=cp.name,
                    icon=cp.icon,
                    address=cp.address,
                    postcode=cp.postcode,
                )
            )
        self._db.commit()
        return self.get_for_user(user_id)


def get_saved_place_repo(db: Session = Depends(get_db)) -> SavedPlaceRepository:
    """FastAPI dependency that yields a session-scoped SavedPlaceRepository."""
    return SavedPlaceRepository(db)
