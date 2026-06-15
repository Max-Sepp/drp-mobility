# backend/CLAUDE.md

Guidance for Claude Code when working inside `backend/`. Top-level project context lives in the repo-root `CLAUDE.md`.

## Commands

```bash
# from backend/, with venv activated and requirements installed
DEV=true uvicorn app.main:app --reload              # dev server on :8000, docs at /docs
pytest                                              # full suite
pytest tests/test_outage_reports.py::test_name      # single test
ruff check .                                        # lint
ruff check --fix .                                  # lint + autofix
ruff format .                                       # format

# Refresh station data from TfL CSVs (run from repo root):
python3 backend/seed_stations_data.py
rm dev.db && uvicorn app.main:app --reload          # reseed with updated data

# Full reseed of any database, incl. Postgres (run from backend/):
python scripts/reseed.py                            # drops ALL tables, rebuilds, reseeds
python scripts/reseed.py --yes                      # skip the confirmation prompt
rm dev.db && DEV=true uvicorn app.main:app --reload # reseed with updated data
```

`DEV=true` enables the CORS middleware that allows the Expo web dev server (ports 8081/19006) to reach the API. Without it CORS headers are not set — this is intentional; the native app does not go through a browser so CORS is irrelevant in production.

Lint/format use [Ruff](https://docs.astral.sh/ruff/) (config in `pyproject.toml`). Ruff is a dev-only dependency — install it with `pip install -r requirements-dev.txt` (it is deliberately kept out of `requirements.txt` so the prod image stays lean). FastAPI's `Depends(...)`-in-default and SQLAlchemy/Pydantic string forward references are whitelisted in the config; don't "fix" those.

A fresh dev DB is just `rm dev.db` — `create_all` + `seed_defaults` rebuild it on next startup. There are no migrations. For Postgres (no file to delete) — or to force a rebuild that picks up edited `stations.json`, since `seed_defaults` is insert-if-missing and won't refresh existing rows — use `python scripts/reseed.py`, which drops every table (including user data), recreates the schema, and reseeds.

## Composition root (`app/main.py`)

At import time, `main.py`:
1. Imports every model module so each ORM class registers on `Base.metadata`. **Adding a new model? Add an import here**, otherwise `create_all` won't create its table.
2. Runs `Base.metadata.create_all(bind=engine)`.
3. Runs `seed_defaults(session)` against the configured engine — including in production. The seed is idempotent (per-row "does this name exist?" checks), so it's safe but it does mean every startup hits the DB.
4. Adds middleware: `GZipMiddleware` (the `/stations` payload is ~300–400 KB → ~50–80 KB) and, **only when `DEV=true`**, `CORSMiddleware`.
5. Mounts each router.

On startup (the `lifespan` context manager) it also:
- Binds the in-memory SSE event broker to the running asyncio loop (`broker.bind_loop(...)`) so sync threadpool endpoints can publish events via `call_soon_threadsafe`.
- Spawns the **TfL poll loop** (unless `TFL_POLL_ENABLED=false`): every `TFL_POLL_INTERVAL` seconds (default 600) it runs `ingest_once` in a worker thread. Every iteration's errors are swallowed so an offline/empty TfL feed never kills the loop.

## Services (`app/services/`)

The ingest + notification side, layered on top of the repositories:

- `tfl.py` — thin HTTP client wrapping TfL's `GET /Disruptions/Lifts/v2` and `GET /StopPoint/Mode/{modes}/Disruption`. Configured via `TFL_API_BASE` / `TFL_APP_KEY` env vars.
- `tfl_ingest.py` (`ingest_once`) — maps TfL disruption payloads onto internal models: opens/resolves `Failure`s and creates pre-verified `OutageReport`s (source=`"tfl"`) for matched lifts, and creates/clears `StationAlert`s for unmatched or broader disruptions. **Enforces privilege ordering: a trusted human's authoritative close is never overridden by the automated feed** (see the `tfl-trusted-privilege` memory). Publishes SSE events after each change.
- `notifications.py` — run as a FastAPI `BackgroundTask` after the *first* report for a piece of equipment; finds users whose saved journeys touch the affected station and batches Expo Push API calls.
- `station_matching.py` — normalises station names (e.g. `"King's Cross"` ↔ TfL's `"King's Cross St. Pancras Underground Station"`) for both ingest and notification dispatch.

`app/http_cache.py` memoises repeated TfL HTTP GETs within a single ingest run.

## Auth (`app/dependencies/auth.py`, `routers/auth.py`)

Session-token auth: signup/login issue a `Session` row whose token the app sends as a Bearer header. `dependencies/auth.py` exposes the `current_user` dependency that routers requiring auth depend on. `scripts/trust_user.py` flags a user as trusted (their report closes outrank the TfL feed).

## Live updates — SSE (`app/events.py`)

`OutageEventBroker` is an in-memory async pub/sub. `GET /outage-reports/stream` holds an open connection and drains a per-subscriber queue as SSE frames; `publish()` is thread-safe so sync endpoints and the ingest thread can emit. **Single-process only** — a multi-worker deploy would need Redis pub/sub or Postgres LISTEN/NOTIFY.

## Per-resource layering

Each resource has the same four files (`outage_report.py` shown):

```
routers/outage_reports.py     HTTP layer — thin, translates HTTPException etc.
repositories/outage_report.py Data access — exposes a get_repo dependency
models/outage_report.py       SQLAlchemy ORM
schemas/outage_report.py      Pydantic request/response (from_attributes=True for ORM-shaped responses)
```

Routers should not touch the ORM directly — go through the repository. Repositories own transaction boundaries (`commit`/`flush`).

## Database (`app/database.py`)

- `DATABASE_URL` → Postgres in production; otherwise falls back to `sqlite:///./dev.db`. The legacy `postgres://` scheme from Heroku/Railway is auto-normalized to `postgresql://`.
- `SessionLocal` is the shared sessionmaker used by both the request-scoped `get_db` dependency and the startup-time seed.
- SQLite requires `check_same_thread=False` because FastAPI may close the session on a different thread than the request handler.

## Outage report domain model

The grouping invariant is the non-obvious part:

- **`Failure`** represents one *incident* affecting one piece of equipment. A failure is open until someone PATCHes `/failures/{id}/resolve`.
- **`OutageReport`** is one *user submission* attached to a Failure. New reports for equipment with an open failure attach to that failure; if all prior failures for that equipment are resolved, a new Failure is opened.
- **At most one open Failure per equipment** is enforced by a partial unique index (`uq_failures_one_open_per_equipment` in `models/failure.py`, with `sqlite_where`/`postgresql_where` so it works on both engines). This closes the read-then-insert race in `OutageReportRepository._find_or_create_failure` — concurrent reports will both miss the SELECT, one INSERT wins, the loser catches `IntegrityError`, rolls back, and re-reads the winner's failure so both reports land under the same row.
- **Soft delete**: `DELETE /outage-reports/{id}` inserts an `OutageReportDeletion` row; the original `OutageReport` row stays. Repository methods use the `_ACTIVE_FILTER` (`NOT EXISTS` subquery) to exclude soft-deleted rows from listings.
- **Images** are stored as bytes directly on the `OutageReport` row (`image`, `image_content_type`). The JSON summary only exposes `image_content_type` — actual bytes are served via a separate `GET /{id}/image` route. The upload route falls back to filename-extension MIME detection because React Native's `FormData` often sends a generic content-type.

## Reference data caching (`app/repositories/cache.py`)

`cached_list` is a descriptor that caches a no-arg method's return value **on the class, not the instance** — so the cache survives across requests in the same process. Used by `StationRepository`, `EquipmentTypeRepository`, and the `_all()` helper in `EquipmentRepository`. Only safe for tables that don't change at runtime (currently true: stations/equipment types/equipment are seed-only). If a future feature adds writes to those tables, this cache must be invalidated or removed.

## Tests (`tests/`)

- `conftest.py` creates a fresh in-memory SQLite engine per test (`StaticPool` so the connection is shared across threads), runs `create_all`, then calls `seed_defaults`. The `client` fixture overrides `get_db` to use that session.
- Tests assume seed data is present (e.g. they query `Station.filter_by(name="Victoria")`). Don't write tests that create stations/equipment directly — extend the seed or look up the seeded rows.
- `test_auth.py` — signup/login/logout, session tokens, `/auth/me`.
- `test_failures.py` — the grouping rules and the partial unique index.
- `test_outage_reports.py` — CRUD + image upload + soft delete.
- `test_outage_stream.py` — the SSE `/outage-reports/stream` endpoint.
- `test_tfl_ingest.py` — ingest mapping, failure/alert creation, and the human-close privilege ordering.
- `test_lookup_tables.py` — the cached `/stations` and `/equipment-types` endpoints.
- `test_lift_seeding.py` — named lifts are seeded correctly from the TfL enriched data.
- `test_lines.py` — platform names and line assignments for key stations.
- `test_platform_step_free.py` — per-platform `stepFreeAccess` values.

## Station seed data (`app/data/stations.json`)

All 387 stations are enriched from `temp/tfl-stationdata-detailed/` via `backend/seed_stations_data.py`. Key points:

- **No station-level `step_free`** — step-free access is per-platform only (`stepFreeAccess` on each platform object).
- **`stepFreeAccess`** is derived by BFS on a step-free pathway graph (SameLevelPaths + RampRoutes + Lifts CSVs from the `-Outside` virtual node). Values: `"Full"` / `"to_platform"` / `"to_train"` / `"none"`.
- **`lift_units`** come from Lifts.csv for stations in that feed; deep-tube stations with no CSV entry get synthesised units (shared concourse → all platforms).
- **`escalator_units` are mocked** — the TfL feed has no escalator topology. Units are synthesised by distributing the escalator count round-robin across customer-facing platforms and tagged `"mocked": true`. This data must be replaced with hand-curated data before treating as authoritative.
- **`app/data/station_overrides.json`** contains hand-curated corrections applied after CSV enrichment (lifts absent from the TfL feed, platform `stepFreeAccess` fixes, etc.). Entries here always win over automated sources. Edit this file and re-run `seed_stations_data.py` to apply corrections.
- The `Station` ORM model only stores `id` and `name` — all other fields are in the JSON and used only during seeding to create `Platform` and `Equipment` rows.

## Schema changes — workflow

1. Edit the model and any related schema/repo.
2. If adding a model: import it in `app/main.py`.
3. Delete `dev.db` (locally) and restart `uvicorn` — `create_all` rebuilds.
4. From `frontend/`, run `npm run generate:api` to refresh the typed client.
