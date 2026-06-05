# Backend

FastAPI backend for the DRP Mobility app.

## Requirements

- Python 3.10+ (uses PEP 604 `X | None` syntax)

## Setup

From the `backend/` directory:

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt   # dev tools: ruff
```

## Run

```bash
DEV=true uvicorn app.main:app --reload
```

The server starts on http://127.0.0.1:8000. Interactive docs at http://127.0.0.1:8000/docs.

`DEV=true` enables CORS middleware so the Expo web dev server (ports 8081/19006) can reach the API. Omit it in production — the native app doesn't go through a browser.

## Tests

```bash
pytest
```

Tests use an in-memory SQLite database seeded with the same reference data as production. See `tests/conftest.py`.

## Database

Development uses SQLite (`dev.db`, gitignored). Tables are created from ORM metadata at startup — there are no migrations. To reset:

```bash
rm dev.db && DEV=true uvicorn app.main:app --reload   # local SQLite
python scripts/reseed.py                               # any DB (drops all tables, rebuilds, reseeds)
python scripts/reseed.py --yes                         # skip confirmation prompt
```

`scripts/reseed.py` is the right tool when you need to rebuild Postgres (no file to delete) or when you've edited `stations.json` and need seed data to be refreshed (the startup seed is insert-if-missing and won't update existing rows).

## Station data

All 387 TfL stations live in `app/data/stations.json`, enriched from TfL's step-free access CSV feed. To update from the CSV source:

```bash
# from repo root:
python3 temp/enrich_tube_stations.py
# then reseed as above
```

Step-free access is **per-platform only** — there is no station-level step-free field. Escalator units are mocked estimates (tagged `"mocked": true`) and must not be treated as authoritative routing data.

## Project layout

```
backend/
├── app/
│   ├── main.py              # FastAPI app + router registration + startup hooks
│   ├── database.py          # SQLAlchemy engine, session, Base, get_db dep
│   ├── seed.py              # idempotent reference-data seeding (runs on startup)
│   ├── dependencies/        # shared FastAPI Depends (auth, current user)
│   ├── routers/             # APIRouter modules (one per resource, HTTP layer only)
│   ├── repositories/        # data access layer (owns transaction boundaries)
│   ├── models/              # SQLAlchemy ORM models
│   ├── schemas/             # Pydantic request/response schemas
│   ├── services/            # business logic that spans multiple repositories
│   └── data/
│       └── stations.json    # enriched TfL station data (387 stations)
├── scripts/
│   └── reseed.py            # drop-all / recreate / reseed utility
├── tests/
│   ├── conftest.py          # in-memory DB, seeded fixtures
│   └── test_*.py
├── requirements.txt
├── requirements-dev.txt     # ruff (lint/format)
└── pyproject.toml           # ruff config
```

## Per-resource layering

Each resource follows the same four-file pattern:

```
routers/<name>.py        HTTP layer — thin, handles HTTPException, auth
repositories/<name>.py   Data access — owns commits/flushes, exposes get_repo dep
models/<name>.py         SQLAlchemy ORM model
schemas/<name>.py        Pydantic request/response (from_attributes=True)
```

Routers do not touch the ORM directly — all DB access goes through the repository.

## Adding a resource

1. Create `app/models/<name>.py` subclassing `Base`.
2. Import the model in `app/main.py` so it registers on `Base.metadata` before `create_all` runs.
3. Create `app/repositories/<name>.py` exposing a `get_repo` dependency.
4. Create `app/schemas/<name>.py` with `model_config = ConfigDict(from_attributes=True)`.
5. Create `app/routers/<name>.py` with `router = APIRouter(...)` and mount it in `app/main.py`.
6. Delete `dev.db` and restart; then run `npm run generate:api` in `frontend/` to refresh the typed client.

## Lint and format

```bash
ruff check .          # lint
ruff check --fix .    # lint + autofix
ruff format .         # format
```
