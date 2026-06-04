from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.user import UserRepository, get_user_repo
from app.schemas.user import AuthResponse, UserCreate, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])

_bearer = HTTPBearer(auto_error=False)


@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(
    payload: UserCreate,
    repo: UserRepository = Depends(get_user_repo),
) -> AuthResponse:
    """Create a new (untrusted) account and return a session token."""
    try:
        user = repo.create(payload.username, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    session = repo.create_session(user)
    return AuthResponse(token=session.token, user=UserPublic.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(
    payload: UserCreate,
    repo: UserRepository = Depends(get_user_repo),
) -> AuthResponse:
    """Verify credentials and return a fresh session token."""
    user = repo.get_by_username(payload.username)
    if user is None or not repo.verify_password(user, payload.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    session = repo.create_session(user)
    return AuthResponse(token=session.token, user=UserPublic.model_validate(user))


@router.post("/logout", status_code=204)
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    _user: User = Depends(get_current_user),
    repo: UserRepository = Depends(get_user_repo),
) -> None:
    """Invalidate the caller's session token."""
    repo.delete_session(credentials.credentials)


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(get_current_user)) -> UserPublic:
    """Return the currently authenticated user (used to validate a stored token on app launch)."""
    return UserPublic.model_validate(user)
