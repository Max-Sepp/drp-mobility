from datetime import datetime, timezone

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PushToken(Base):
    """Expo push token for one of an authenticated user's devices.

    One row per device (token is unique). A single user may have multiple rows if they
    have multiple devices. PUT /users/me/push-token upserts by token value, so re-installs
    and token refreshes are handled transparently."""

    __tablename__ = "push_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(tz=timezone.utc))

    user: Mapped["User"] = relationship("User", back_populates="push_tokens")  # noqa: F821
