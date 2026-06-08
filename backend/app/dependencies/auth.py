from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.models.user import User
from app.repositories.user import UserRepository, get_user_repo

# auto_error=False so a missing token yields None instead of FastAPI's default 403 — we want a
# uniform 401 from get_current_user and a graceful None from get_optional_user.
_bearer = HTTPBearer(auto_error=False)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    repo: UserRepository = Depends(get_user_repo),
) -> User | None:
    """Resolve the current user from a Bearer token, or None if absent/invalid.

    Used by endpoints that work for both anonymous and authenticated callers (e.g. submitting an
    outage report)."""
    if credentials is None:
        return None
    return repo.get_user_by_token(credentials.credentials)


def get_current_user(user: User | None = Depends(get_optional_user)) -> User:
    """Require an authenticated user, raising 401 when the token is missing or invalid."""
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_trusted_user(user: User = Depends(get_current_user)) -> User:
    """Require an authenticated user with the trusted role, raising 403 otherwise."""
    if user.role != "trusted":
        raise HTTPException(status_code=403, detail="Trusted role required")
    return user
