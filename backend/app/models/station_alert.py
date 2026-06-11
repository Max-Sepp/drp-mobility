import enum
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class StationAlertKind(str, enum.Enum):
    """Category of a station-level accessibility advisory ingested from TfL.

    These are the disruptions that don't fit the per-equipment Failure model: a lift outage we
    couldn't pin to a specific Equipment row, a whole-station step-free loss, a closure, etc.
    Stored as a portable VARCHAR + CHECK (native_enum=False), like PlatformStepFree.
    """

    LIFT_OUTAGE = "lift_outage"
    STEP_FREE_UNAVAILABLE = "step_free_unavailable"
    CLOSURE = "closure"
    ACCESSIBILITY = "accessibility"
    OTHER = "other"


class StationAlert(Base):
    """A station-level accessibility advisory (bucket B), surfaced as a banner rather than a
    broken-equipment card. Currently sourced only from the TfL disruption poller."""

    __tablename__ = "station_alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    station_id: Mapped[int] = mapped_column(ForeignKey("stations.id"), index=True)
    kind: Mapped[StationAlertKind] = mapped_column(
        SAEnum(
            StationAlertKind,
            native_enum=False,
            values_callable=lambda e: [m.value for m in e],
        )
    )
    message: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(default="tfl")
    # Stable upstream id used to dedupe across polls and to reconcile clears. Indexed, not unique.
    external_ref: Mapped[str | None] = mapped_column(index=True, default=None)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    started_at: Mapped[datetime] = mapped_column()
    cleared_at: Mapped[datetime | None] = mapped_column(default=None)
    last_seen_at: Mapped[datetime] = mapped_column()
    # True when a trusted human dismissed this alert. Final: the poller's upsert must never
    # reactivate a dismissed alert, even while the feed still reports it.
    dismissed_authoritative: Mapped[bool] = mapped_column(default=False)

    station: Mapped["Station"] = relationship("Station")  # noqa: F821
