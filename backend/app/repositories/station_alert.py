from datetime import datetime

from fastapi import Depends
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.station_alert import StationAlert, StationAlertKind

_STATION_JOINEDLOAD = [joinedload(StationAlert.station)]


class StationAlertRepository:
    """Data access for station-level accessibility advisories (bucket B)."""

    def __init__(self, db: Session) -> None:
        self._db = db

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def list_active(self, station_id: int | None = None) -> list[StationAlert]:
        """Return active alerts (optionally for one station), newest first."""
        query = (
            self._db.query(StationAlert)
            .options(*_STATION_JOINEDLOAD)
            .filter(StationAlert.active.is_(True))
        )
        if station_id is not None:
            query = query.filter(StationAlert.station_id == station_id)
        return query.order_by(StationAlert.started_at.desc()).all()

    def get(self, alert_id: int) -> StationAlert | None:
        """Fetch an alert with its station eagerly loaded."""
        return (
            self._db.query(StationAlert)
            .options(*_STATION_JOINEDLOAD)
            .filter(StationAlert.id == alert_id)
            .one_or_none()
        )

    # ------------------------------------------------------------------
    # Ingest mutations
    # ------------------------------------------------------------------

    def upsert_active(
        self,
        station_id: int,
        kind: StationAlertKind,
        message: str,
        external_ref: str,
        now: datetime,
    ) -> StationAlert | None:
        """Create an alert for this disruption, or refresh an existing one's last_seen_at.

        Returns the live alert, or ``None`` when the alert was previously dismissed by a trusted
        human — such an alert is never reactivated, even while the feed still reports it."""
        existing = (
            self._db.query(StationAlert)
            .filter(StationAlert.source == "tfl", StationAlert.external_ref == external_ref)
            .order_by(StationAlert.id.desc())
            .first()
        )
        if existing is not None and existing.dismissed_authoritative:
            return None
        if existing is not None and existing.active:
            existing.message = message
            existing.kind = kind
            existing.last_seen_at = now
            self._db.commit()
            self._db.refresh(existing)
            return existing

        alert = StationAlert(
            station_id=station_id,
            kind=kind,
            message=message,
            source="tfl",
            external_ref=external_ref,
            active=True,
            started_at=now,
            last_seen_at=now,
        )
        self._db.add(alert)
        self._db.commit()
        self._db.refresh(alert)
        return alert

    def deactivate_missing(
        self, source: str, seen_refs: set[str], now: datetime
    ) -> list[StationAlert]:
        """Clear active alerts of *source* whose external_ref was not seen this poll cycle.

        Returns the alerts that were cleared."""
        active = (
            self._db.query(StationAlert)
            .filter(StationAlert.source == source, StationAlert.active.is_(True))
            .all()
        )
        cleared = [a for a in active if a.external_ref not in seen_refs]
        for alert in cleared:
            alert.active = False
            alert.cleared_at = now
        if cleared:
            self._db.commit()
        return cleared

    def dismiss(self, alert: StationAlert, now: datetime) -> StationAlert:
        """Trusted-human dismissal: clear the alert and mark it final so the poller never
        reactivates it."""
        alert.active = False
        alert.cleared_at = now
        alert.dismissed_authoritative = True
        self._db.commit()
        self._db.refresh(alert)
        return alert


def get_station_alert_repo(db: Session = Depends(get_db)) -> StationAlertRepository:
    """FastAPI dependency that yields a session-scoped StationAlertRepository."""
    return StationAlertRepository(db)
