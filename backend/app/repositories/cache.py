import functools
import time
from typing import Any

# Immutable reference data still gets a weekly invalidation so no cached copy lives forever:
# after this window the next call re-queries the database (and any derived ETag is rebuilt).
CACHE_TTL_SECONDS = 7 * 24 * 60 * 60


class cached_list:
    """Descriptor/decorator that caches a no-arg method's return value on the owning
    class the first time it is called.  Subsequent calls return the cached value without
    hitting the database.  The cache lives on the class (not the instance), so it
    survives across requests in the same process — suitable for immutable reference data.

    The cached value is held alongside the time it was computed and is refreshed once it is
    older than ``CACHE_TTL_SECONDS`` (weekly), so the database is consulted at least that often.

    Usage:
        @cached_list
        def list_all(self) -> list[SomeSchema]:
            ...  # expensive DB query, run once
    """

    def __init__(self, fn) -> None:
        self._fn = fn
        # Fallback name used before __set_name__ fires (e.g. outside a class body).
        self._attr = f"_cache_{fn.__name__}"
        functools.update_wrapper(self, fn)

    def __set_name__(self, owner: type, name: str) -> None:
        self._attr = f"_cache_{name}"

    def __get__(self, obj: Any, objtype: type | None = None):
        if obj is None:
            return self

        attr = self._attr
        fn = self._fn

        def _call():
            # Each entry is a (value, computed_at) pair stored on the class.
            entry = getattr(objtype, attr, None)
            if entry is None or time.monotonic() - entry[1] >= CACHE_TTL_SECONDS:
                entry = (fn(obj), time.monotonic())
                setattr(objtype, attr, entry)
            return entry[0]

        return _call
