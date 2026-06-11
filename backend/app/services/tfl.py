"""Thin HTTP client for the TfL Unified API disruption feeds.

TfL has no push mechanism, so the poller (services/tfl_ingest.py) pulls these endpoints on an
interval. All knowledge of TfL's wire format is isolated to this module and the field-mapping
helpers in tfl_ingest, so adapting to the real payload shape is a one-place change.

Configuration (env):
  TFL_API_BASE   base URL (default https://api.tfl.gov.uk)
  TFL_APP_KEY    optional app key appended as a query param to raise rate limits
"""

import logging
import os

import httpx

_log = logging.getLogger(__name__)

_DEFAULT_BASE = "https://api.tfl.gov.uk"
_TIMEOUT = 10.0


def _base_url() -> str:
    return os.getenv("TFL_API_BASE", _DEFAULT_BASE).rstrip("/")


def _params() -> dict[str, str]:
    key = os.getenv("TFL_APP_KEY")
    return {"app_key": key} if key else {}


def _get(path: str) -> list[dict]:
    """GET a TfL endpoint and return its JSON array (empty list on a non-array body)."""
    url = f"{_base_url()}{path}"
    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.get(url, params=_params(), headers={"Accept": "application/json"})
    resp.raise_for_status()
    data = resp.json()
    if not isinstance(data, list):
        _log.warning("TfL %s returned a non-array body (%s)", path, type(data).__name__)
        return []
    return data


def fetch_lift_disruptions() -> list[dict]:
    """Return the raw lift-disruption objects from /Disruptions/Lifts/v2."""
    return _get("/Disruptions/Lifts/v2")


def fetch_stoppoint_disruptions(modes: str) -> list[dict]:
    """Return the raw stop-point disruption objects for the given comma-separated modes."""
    return _get(f"/StopPoint/Mode/{modes}/Disruption")
