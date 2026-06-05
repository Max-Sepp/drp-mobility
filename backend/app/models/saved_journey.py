from datetime import datetime

from sqlalchemy import ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class SavedJourney(Base):
    """A journey snapshot saved by an authenticated user. `payload` is the full
    SavedJourney JSON blob from the frontend — stored opaquely so the complex TfL leg
    structure doesn't need a relational decomposition and changes to the blob need no
    migration."""

    __tablename__ = "saved_journeys"

    id: Mapped[str] = mapped_column(primary_key=True)  # client-generated id
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    saved_at: Mapped[datetime] = mapped_column()
    payload: Mapped[str] = mapped_column(Text)

    user: Mapped["User"] = relationship("User", back_populates="journeys")  # noqa: F821
