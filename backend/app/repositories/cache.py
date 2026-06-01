import functools
from typing import Any


class cached_list:
    """Descriptor/decorator that caches a no-arg method's return value on the owning
    class the first time it is called.  Subsequent calls return the cached value without
    hitting the database.  The cache lives on the class (not the instance), so it
    survives across requests in the same process — suitable for immutable reference data.

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
            if getattr(objtype, attr, None) is None:
                setattr(objtype, attr, fn(obj))
            return getattr(objtype, attr)

        return _call
