from datetime import datetime, timezone

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AuthSession(Base):
    """An opaque session token issued at login/signup and presented as a Bearer token.

    Named AuthSession (not Session) to avoid clashing with SQLAlchemy's Session. `expires_at` is
    nullable: a NULL value means the token never expires (the current default — no rotation yet)."""

    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(tz=timezone.utc))
    expires_at: Mapped[datetime | None] = mapped_column(default=None)

    user: Mapped["User"] = relationship("User", back_populates="sessions")
