from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_trusted_user
from app.models.user import User
from app.services.tfl_ingest import ingest_once

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/tfl/ingest")
def trigger_tfl_ingest(
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_trusted_user),
) -> dict[str, int]:
    """Run one TfL disruption ingest cycle now and return the counts.

    Intended for a cron job (authenticated with a trusted user's bearer token) or manual use; the
    in-process auto-poll loop runs the same ``ingest_once`` on an interval."""
    return ingest_once(db).as_dict()
