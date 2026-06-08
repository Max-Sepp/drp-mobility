from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SavedPlace(Base):
    """A named location saved by an authenticated user.

    place_type is "home", "work", or "custom".
    home/work rows have name, icon, and client_id as NULL.
    custom rows carry name, icon, and client_id (the id the frontend minted, preserved so
    round-trips don't generate new ids).
    """

    __tablename__ = "saved_places"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    place_type: Mapped[str] = mapped_column(String)
    client_id: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    name: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    icon: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    address: Mapped[str] = mapped_column(String)
    postcode: Mapped[str] = mapped_column(String)

    user: Mapped["User"] = relationship("User", back_populates="saved_places")  # noqa: F821
