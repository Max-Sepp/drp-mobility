from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies.auth import get_trusted_user
from app.models.user import User
from app.repositories.station_alert import StationAlertRepository, get_station_alert_repo
from app.schemas.station_alert import StationAlertSchema

router = APIRouter(prefix="/station-alerts", tags=["station-alerts"])


@router.get("", response_model=list[StationAlertSchema])
def list_station_alerts(
    active: bool = True,
    station_id: int | None = None,
    repo: StationAlertRepository = Depends(get_station_alert_repo),
) -> list[StationAlertSchema]:
    """Return station-level accessibility alerts, newest first.

    Defaults to active alerts only; pass ``active=false`` to include cleared ones. Optionally
    filter to a single station."""
    if active:
        return repo.list_active(station_id=station_id)
    # Cleared-history listing is not needed yet; only the active feed is supported.
    raise HTTPException(status_code=400, detail="Only active=true is supported")


@router.patch("/{alert_id}/dismiss", response_model=StationAlertSchema)
def dismiss_station_alert(
    alert_id: int,
    repo: StationAlertRepository = Depends(get_station_alert_repo),
    _current_user: User = Depends(get_trusted_user),
) -> StationAlertSchema:
    """Trusted-user dismissal of an alert. Final: the TfL poller will never reactivate it."""
    alert = repo.get(alert_id)
    if alert is None:
        raise HTTPException(status_code=404, detail="Station alert not found")
    return repo.dismiss(alert, datetime.now(tz=timezone.utc))
