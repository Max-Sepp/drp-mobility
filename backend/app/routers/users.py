from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies.auth import get_current_user
from app.models.user import User
from app.repositories.push_token import PushTokenRepository, get_push_token_repo

router = APIRouter(prefix="/users", tags=["users"])


class PushTokenBody(BaseModel):
    token: str


@router.put("/me/push-token", status_code=204)
def register_push_token(
    body: PushTokenBody,
    current_user: User = Depends(get_current_user),
    repo: PushTokenRepository = Depends(get_push_token_repo),
) -> None:
    """Register an Expo push token for the authenticated user.

    Idempotent: calling again with the same token value is a no-op. If the token is already
    registered to a different user (e.g. after an account switch on the same device), it is
    re-assigned to the current user."""
    repo.upsert(current_user.id, body.token)


@router.delete("/me/push-token", status_code=204)
def deregister_push_token(
    body: PushTokenBody,
    current_user: User = Depends(get_current_user),
    repo: PushTokenRepository = Depends(get_push_token_repo),
) -> None:
    """Remove a specific push token for the current user (called on logout from a device).

    No-op if the token is not found or belongs to a different user."""
    repo.delete_for_user(current_user.id, body.token)
