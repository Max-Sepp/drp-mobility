import secrets
from datetime import datetime, timezone

import bcrypt
from fastapi import Depends
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.session import AuthSession
from app.models.user import User, UserRole


class UserRepository:
    """Data access for users and their opaque session tokens, including password hashing."""

    def __init__(self, db: Session) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Users
    # ------------------------------------------------------------------

    def get_by_username(self, username: str) -> User | None:
        return self._db.query(User).filter_by(username=username).one_or_none()

    def create(self, username: str, password: str) -> User:
        """Create a new (always untrusted) user. Raises ValueError if the username is taken."""
        if self.get_by_username(username) is not None:
            raise ValueError(f"username {username!r} is already taken")

        user = User(
            username=username,
            password_hash=_hash_password(password),
            role=UserRole.UNTRUSTED.value,
        )
        self._db.add(user)
        try:
            self._db.commit()
        except IntegrityError as exc:
            # Lost a race against a concurrent signup with the same username.
            self._db.rollback()
            raise ValueError(f"username {username!r} is already taken") from exc
        self._db.refresh(user)
        return user

    def verify_password(self, user: User, password: str) -> bool:
        return bcrypt.checkpw(password.encode("utf-8"), user.password_hash.encode("utf-8"))

    def update_railcard(self, user: User, railcard: str | None) -> User:
        user.railcard = railcard
        self._db.commit()
        self._db.refresh(user)
        return user

    # ------------------------------------------------------------------
    # Sessions
    # ------------------------------------------------------------------

    def create_session(self, user: User) -> AuthSession:
        """Mint a new opaque session token for a user (no expiry for now)."""
        session = AuthSession(token=secrets.token_urlsafe(32), user_id=user.id)
        self._db.add(session)
        self._db.commit()
        self._db.refresh(session)
        return session

    def get_user_by_token(self, token: str) -> User | None:
        """Resolve a Bearer token to its user, ignoring expired sessions."""
        session = self._db.get(AuthSession, token)
        if session is None:
            return None
        if session.expires_at is not None and session.expires_at < datetime.now(tz=timezone.utc):
            return None
        return session.user

    def delete_session(self, token: str) -> None:
        """Invalidate a session token (logout). No-op if the token is unknown."""
        session = self._db.get(AuthSession, token)
        if session is not None:
            self._db.delete(session)
            self._db.commit()


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def get_user_repo(db: Session = Depends(get_db)) -> UserRepository:
    """FastAPI dependency that yields a session-scoped UserRepository."""
    return UserRepository(db)
