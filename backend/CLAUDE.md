# backend/CLAUDE.md

Guidance for Claude Code when working inside `backend/`. Top-level project context lives in the repo-root `CLAUDE.md`.

## Commands

```bash
# from backend/, with venv activated and requirements installed
uvicorn app.main:app --reload                       # dev server on :8000, docs at /docs
pytest                                              # full suite
pytest tests/test_outage_reports.py::test_name      # single test

# Refresh station data from TfL CSVs (run from repo root):
python3 temp/enrich_tube_stations.py
rm dev.db && uvicorn app.main:app --reload          # reseed with updated data
```

A fresh dev DB is just `rm dev.db` — `create_all` + `seed_defaults` rebuild it on next startup. There are no migrations.

## Composition root (`app/main.py`)

At import time, `main.py`:
1. Imports every model module so each ORM class registers on `Base.metadata`. **Adding a new model? Add an import here**, otherwise `create_all` won't create its table.
2. Runs `Base.metadata.create_all(bind=engine)`.
3. Runs `seed_defaults(session)` against the configured engine — including in production. The seed is idempotent (per-row "does this name exist?" checks), so it's safe but it does mean every startup hits the DB.
4. Mounts each router.

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
- `test_failures.py` covers the grouping rules and the partial unique index; `test_lookup_tables.py` covers the cached `/stations` and `/equipment-types` endpoints; `test_outage_reports.py` covers CRUD + image upload.
- `test_lift_seeding.py` verifies named lifts are seeded correctly from the TfL enriched data.
- `test_lines.py` checks platform names and line assignments for key stations.

## Station seed data (`app/data/stations.json`)

All 387 stations are enriched from `temp/tfl-stationdata-detailed/` via `temp/enrich_tube_stations.py`. Key points:

- **No station-level `step_free`** — step-free access is per-platform only (`stepFreeAccess` on each platform object).
- **`stepFreeAccess`** is derived by BFS on a step-free pathway graph (SameLevelPaths + RampRoutes + Lifts CSVs from the `-Outside` virtual node). Values: `"Full"` / `"to_platform"` / `"to_train"` / `"none"`.
- **`lift_units`** come from Lifts.csv for stations in that feed; deep-tube stations with no CSV entry get synthesised units (shared concourse → all platforms).
- **`escalator_units` are mocked** — the TfL feed has no escalator topology. Units are synthesised by distributing the escalator count round-robin across customer-facing platforms and tagged `"mocked": true`. This data must be replaced with hand-curated data before treating as authoritative.
- The `Station` ORM model only stores `id` and `name` — all other fields are in the JSON and used only during seeding to create `Platform` and `Equipment` rows.

## Schema changes — workflow

1. Edit the model and any related schema/repo.
2. If adding a model: import it in `app/main.py`.
3. Delete `dev.db` (locally) and restart `uvicorn` — `create_all` rebuilds.
4. From `frontend/`, run `npm run generate:api` to refresh the typed client.
