"""Push notification dispatch for newly-created equipment failures.

Called as a FastAPI BackgroundTask after the first outage report for a given piece of
equipment is submitted. Finds every authenticated user whose saved journeys touch the
affected station and sends them an Expo push notification.

Station-name matching uses the shared ``normalise_station_name`` helper
(app/services/station_matching.py), which mirrors the frontend's ``normaliseStationName``.
This lets our terse station names ("King's Cross") match TfL's verbose ``commonName`` values
("King's Cross St. Pancras Underground Station") via substring containment.
"""

import json
import logging
from collections import defaultdict

import httpx
from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.models.equipment import Equipment
from app.models.failure import Failure
from app.repositories.push_token import PushTokenRepository
from app.services.station_matching import normalise_station_name as _normalise

_log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"


def _journey_touches_station(payload_json: str, station_name: str) -> bool:
    """Return True if any leg departure or arrival in the saved journey payload matches
    the given station name (by normalised substring containment)."""
    try:
        payload = json.loads(payload_json)
    except (json.JSONDecodeError, TypeError):
        return False

    target = _normalise(station_name)
    for leg in payload.get("journey", {}).get("legs", []):
        for key in ("departurePoint", "arrivalPoint"):
            point = leg.get(key)
            if point and isinstance(point, dict):
                common_name = point.get("commonName") or ""
                if common_name:
                    normalised = _normalise(common_name)
                    if target in normalised or normalised in target:
                        return True
    return False


def notify_affected_users(failure_id: int) -> None:
    """Background task: send Expo push notifications for a newly-created Failure.

    Opens its own DB session so it can safely run after the request session closes."""
    _log.info("notify_affected_users: starting for failure_id=%d", failure_id)
    with SessionLocal() as db:
        push_tokens = PushTokenRepository(db)
        failure = (
            db.query(Failure)
            .options(
                joinedload(Failure.equipment).joinedload(Equipment.station),
                joinedload(Failure.equipment).joinedload(Equipment.equipment_type),
            )
            .filter_by(id=failure_id)
            .one_or_none()
        )
        if failure is None:
            _log.warning("notify_affected_users: failure_id=%d not found", failure_id)
            return

        station_name: str = failure.equipment.station.name
        equipment_type: str = failure.equipment.equipment_type.name
        _log.info(
            "notify_affected_users: station=%r equipment_type=%r", station_name, equipment_type
        )

        # Collect push tokens and journey payloads grouped by user.
        rows = push_tokens.tokens_with_saved_journeys()
        _log.info("notify_affected_users: %d (token, journey) rows found", len(rows))

        # user_id → {"tokens": {str, ...}, "payloads": [str, ...]}
        by_user: dict[int, dict] = defaultdict(lambda: {"tokens": set(), "payloads": []})
        for token, user_id, payload in rows:
            by_user[user_id]["tokens"].add(token)
            by_user[user_id]["payloads"].append(payload)

        tokens_to_notify: set[str] = set()
        for data in by_user.values():
            if any(_journey_touches_station(p, station_name) for p in data["payloads"]):
                tokens_to_notify.update(data["tokens"])

        _log.info("notify_affected_users: %d token(s) to notify", len(tokens_to_notify))
        if not tokens_to_notify:
            return

        messages = [
            {
                "to": token,
                "title": f"Accessibility alert — {station_name}",
                "body": (
                    f"A {equipment_type} outage has been reported that may affect "
                    "your saved journey."
                ),
                "data": {"failure_id": failure_id, "station_name": station_name},
            }
            for token in tokens_to_notify
        ]

        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    EXPO_PUSH_URL,
                    json=messages,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
            if resp.status_code == 200:
                _log.info("notify_affected_users: Expo accepted %d message(s)", len(messages))
                _prune_stale_tokens(push_tokens, resp.json(), list(tokens_to_notify))
            else:
                _log.error(
                    "notify_affected_users: Expo push API returned %d: %s",
                    resp.status_code,
                    resp.text,
                )
        except Exception:
            _log.exception("Failed to dispatch push notifications for failure %d", failure_id)


def _prune_stale_tokens(
    repo: PushTokenRepository, expo_response: dict, sent_tokens: list[str]
) -> None:
    """Remove tokens that Expo reports as DeviceNotRegistered."""
    data = expo_response.get("data", [])
    if not isinstance(data, list):
        return
    stale: list[str] = []
    for i, ticket in enumerate(data):
        if (
            isinstance(ticket, dict)
            and ticket.get("status") == "error"
            and ticket.get("details", {}).get("error") == "DeviceNotRegistered"
            and i < len(sent_tokens)
        ):
            stale.append(sent_tokens[i])
    repo.delete_by_tokens(stale)
