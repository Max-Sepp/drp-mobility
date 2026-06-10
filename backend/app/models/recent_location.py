from datetime import datetime, timezone

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RecentLocation(Base):
    __tablename__ = "recent_locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    label: Mapped[str] = mapped_column()
    postcode: Mapped[str | None] = mapped_column(nullable=True)
    searched_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(tz=timezone.utc)
    )

    user: Mapped["User"] = relationship("User", back_populates="recent_locations")  # noqa: F821
