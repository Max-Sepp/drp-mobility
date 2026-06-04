import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, SessionLocal, engine
from app.events import broker

# Each model module must be imported here so its table is registered on Base.metadata
# before `create_all` runs. Adding a new model? Import it in this block too.
from app.models import equipment as _equipment  # noqa: F401
from app.models import equipment_type as _equipment_type  # noqa: F401
from app.models import failure as _failure  # noqa: F401
from app.models import line as _line  # noqa: F401
from app.models import outage_report as _outage_report  # noqa: F401
from app.models import outage_report_deletion as _outage_report_deletion  # noqa: F401
from app.models import platform as _platform  # noqa: F401
from app.models import push_token as _push_token  # noqa: F401
from app.models import saved_journey as _saved_journey  # noqa: F401
from app.models import session as _session  # noqa: F401
from app.models import station as _station  # noqa: F401
from app.models import user as _user  # noqa: F401
from app.routers import (
    auth,
    equipment,
    equipment_types,
    failures,
    journeys,
    outage_reports,
    stations,
    users,
)
from app.seed import seed_defaults

# Surface our app's INFO logs (uvicorn configures its own loggers, but not the root logger
# our app modules log through). Honour an optional LOG_LEVEL env var, defaulting to INFO.
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# Schema bootstrap at import time: no Alembic migrations are configured.
Base.metadata.create_all(bind=engine)
# Populate stations / equipment types / equipment so a fresh DB is immediately usable.
with SessionLocal() as session:
    seed_defaults(session)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Capture the running loop so the event broker can publish from sync (threadpool) endpoints.
    broker.bind_loop(asyncio.get_running_loop())
    yield


app = FastAPI(lifespan=lifespan)

if os.getenv("DEV", "false").lower() == "true":
    app.add_middleware(
        CORSMiddleware,
        # Allow Expo web dev server (8081) and any LAN IP the dev may use.
        # In production (EAS native build) the app hits the API directly — no browser CORS applies.
        allow_origins=[
            "http://localhost:8081",
            "http://localhost:19006",
            "http://127.0.0.1:8081",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(journeys.router)
app.include_router(outage_reports.router)
app.include_router(failures.router)
app.include_router(stations.router)
app.include_router(equipment_types.router)
app.include_router(equipment.router)
