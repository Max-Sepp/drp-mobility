from fastapi import FastAPI

from app.database import Base, SessionLocal, engine

# Each model module must be imported here so its table is registered on Base.metadata
# before `create_all` runs. Adding a new model? Import it in this block too.
from app.models import equipment as _equipment  # noqa: F401
from app.models import equipment_type as _equipment_type  # noqa: F401
from app.models import failure as _failure  # noqa: F401
from app.models import line as _line  # noqa: F401
from app.models import outage_report as _outage_report  # noqa: F401
from app.models import outage_report_deletion as _outage_report_deletion  # noqa: F401
from app.models import platform as _platform  # noqa: F401
from app.models import saved_journey as _saved_journey  # noqa: F401
from app.models import session as _session  # noqa: F401
from app.models import station as _station  # noqa: F401
from app.models import user as _user  # noqa: F401
from app.routers import auth, equipment, equipment_types, failures, journeys, outage_reports, stations
from app.seed import seed_defaults

# Schema bootstrap at import time: no Alembic migrations are configured.
Base.metadata.create_all(bind=engine)
# Populate stations / equipment types / equipment so a fresh DB is immediately usable.
with SessionLocal() as session:
    seed_defaults(session)

app = FastAPI()

app.include_router(auth.router)
app.include_router(journeys.router)
app.include_router(outage_reports.router)
app.include_router(failures.router)
app.include_router(stations.router)
app.include_router(equipment_types.router)
app.include_router(equipment.router)
