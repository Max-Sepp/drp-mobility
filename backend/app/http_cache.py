"""HTTP conditional-GET support for immutable reference endpoints.

The reference tables (stations, equipment, equipment types) only change on restart/reseed, so
a process-lifetime ETag is exact.  We still bound staleness with the same weekly TTL used by the
in-process query cache, so a long-lived process recomputes the validator at least once a week.
"""

import hashlib
import time

from fastapi import Request, Response
from pydantic import BaseModel

from app.repositories.cache import CACHE_TTL_SECONDS

# key -> (etag, computed_at). Memoised so the (cheap but non-trivial) hashing of the full
# serialized payload doesn't run on every request.
_etags: dict[str, tuple[str, float]] = {}

# Always revalidate, but allow a client to treat a copy as fresh for at most a week.
_CACHE_CONTROL = "no-cache, max-age=604800"


def _etag_for(items: list[BaseModel], key: str) -> str:
    cached = _etags.get(key)
    if cached is None or time.monotonic() - cached[1] >= CACHE_TTL_SECONDS:
        digest = hashlib.sha256()
        for item in items:
            digest.update(item.model_dump_json().encode())
        # Weak validator: gzip / byte-level variation is irrelevant for our purposes.
        etag = f'W/"{digest.hexdigest()[:16]}"'
        _etags[key] = (etag, time.monotonic())
        return etag
    return cached[0]


def reference_response(
    request: Request, response: Response, items: list[BaseModel], key: str
) -> Response | None:
    """Set caching headers for an immutable list and return a 304 when the client's
    ``If-None-Match`` already matches; otherwise return ``None`` so the caller serves ``items``.
    """
    etag = _etag_for(items, key)
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = _CACHE_CONTROL
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": _CACHE_CONTROL})
    return None
