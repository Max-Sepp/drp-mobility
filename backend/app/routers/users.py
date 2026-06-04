from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models.push_token import PushToken
from app.models.user import User

router = APIRouter(prefix="/users", tags=["users"])


class PushTokenBody(BaseModel):
    token: str


@router.put("/me/push-token", status_code=204)
def register_push_token(
    body: PushTokenBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Register an Expo push token for the authenticated user.

    Idempotent: calling again with the same token value is a no-op. If the token is already
    registered to a different user (e.g. after an account switch on the same device), it is
    re-assigned to the current user."""
    existing = db.query(PushToken).filter_by(token=body.token).one_or_none()
    if existing:
        if existing.user_id != current_user.id:
            existing.user_id = current_user.id
            existing.created_at = datetime.now(tz=timezone.utc)
            db.commit()
    else:
        db.add(PushToken(user_id=current_user.id, token=body.token))
        db.commit()


@router.delete("/me/push-token", status_code=204)
def deregister_push_token(
    body: PushTokenBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    """Remove a specific push token for the current user (called on logout from a device).

    No-op if the token is not found or belongs to a different user."""
    row = (
        db.query(PushToken)
        .filter_by(token=body.token, user_id=current_user.id)
        .one_or_none()
    )
    if row:
        db.delete(row)
        db.commit()
