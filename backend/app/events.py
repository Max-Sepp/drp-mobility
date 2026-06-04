"""In-process publish/subscribe broker for the outage-report SSE stream.

Publishes originate from FastAPI's sync (`def`) endpoints, which Starlette runs in a threadpool —
off the event loop. ``publish`` therefore hands the event to the loop with ``call_soon_threadsafe``,
making it safe to call from any thread; ``subscription`` registers a queue that the SSE response
drains.

Single-worker only: subscribers live in this process's memory, so events do not cross uvicorn
workers. A multi-worker deployment would need a shared channel (Redis pub/sub, Postgres
LISTEN/NOTIFY) in place of these in-memory queues.
"""

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

# An SSE event shaped for sse-starlette's EventSourceResponse,
# e.g. {"event": "created", "data": "<json string>"}.
Event = dict[str, Any]


class OutageEventBroker:
    """Fan-out of outage-report events to every open SSE subscription in this process."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[Event]] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Record the running event loop so ``publish`` can schedule onto it from other threads."""
        self._loop = loop

    @asynccontextmanager
    async def subscription(self) -> AsyncIterator[asyncio.Queue[Event]]:
        """Register a queue that receives published events while the context is open.

        The queue is registered immediately on entry — before the caller takes its initial
        snapshot — so no event published during snapshotting is missed. (Snapshot + queue may
        therefore overlap by one event; clients apply events idempotently, so this is harmless.)
        """
        queue: asyncio.Queue[Event] = asyncio.Queue()
        self._subscribers.add(queue)
        try:
            yield queue
        finally:
            self._subscribers.discard(queue)

    def publish(self, event: Event) -> None:
        """Fan *event* out to all subscribers. Safe to call from any thread.

        No-ops if no loop is bound yet (e.g. at import time, or outside an app lifespan), or if the
        bound loop has already shut down — delivery is best-effort and must never fail a request.
        """
        loop = self._loop
        if loop is None:
            return
        try:
            loop.call_soon_threadsafe(self._broadcast, event)
        except RuntimeError:
            # The loop is closed (e.g. during shutdown); there's nothing to deliver to.
            pass

    def _broadcast(self, event: Event) -> None:
        # Runs on the event loop thread, so touching the queues is safe.
        for queue in self._subscribers:
            queue.put_nowait(event)


broker = OutageEventBroker()


def sse_event(name: str, payload: Any) -> Event:
    """Build an SSE event frame with a JSON-encoded data field."""
    return {"event": name, "data": json.dumps(payload)}
