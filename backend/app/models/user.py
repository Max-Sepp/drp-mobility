from datetime import datetime, timezone
from enum import Enum

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, Enum):
    """How much trust to place in a user's outage reports.

    Every account is created UNTRUSTED; TRUSTED status is granted out-of-band (currently only via
    seeding — there is no in-app promotion flow yet).
    """

    TRUSTED = "trusted"
    UNTRUSTED = "untrusted"
    # Not an account role: a label copied onto reports synthesised from TfL's official disruption
    # feed (see services/tfl_ingest.py). Ranks below a trusted human — the automated feed never
    # overrides a trusted human's close.
    TFL = "tfl"


class User(Base):
    """An account that can authenticate and submit outage reports as a known role.

    Reports are never attributed back to a specific user — only the reporter's role is copied onto
    the report at creation time (see OutageReport.reporter_role)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(unique=True, index=True)
    password_hash: Mapped[str] = mapped_column()
    role: Mapped[str] = mapped_column(default=UserRole.UNTRUSTED.value)
    railcard: Mapped[str | None] = mapped_column(nullable=True, default=None)
    traveller_type: Mapped[str | None] = mapped_column(nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(tz=timezone.utc))

    sessions: Mapped[list["AuthSession"]] = relationship(
        "AuthSession", back_populates="user", cascade="all, delete-orphan"
    )
    journeys: Mapped[list["SavedJourney"]] = relationship(  # noqa: F821
        "SavedJourney", back_populates="user", cascade="all, delete-orphan"
    )
    push_tokens: Mapped[list["PushToken"]] = relationship(  # noqa: F821
        "PushToken", back_populates="user", cascade="all, delete-orphan"
    )
    saved_places: Mapped[list["SavedPlace"]] = relationship(  # noqa: F821
        "SavedPlace", back_populates="user", cascade="all, delete-orphan"
    )
