# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Imperial College Year 2 DRP (Design & Realisation Project) coursework — a student-team prototype, not a production product.

The app's goal is to help mobility-impaired users travel with independence and confidence by giving them trustworthy accessibility information about TfL transit stations and live updates on outages that affect step-free access (e.g. lifts and escalators failing). The product spans:

- **Outage reports** — user-submitted reports attached to a station's equipment, grouped into `Failure` incidents. Fast, low-friction reporting and clear live status are the core flow.
- **Live TfL ingest** — the backend polls TfL's disruption feed and folds matched lift outages into the same `Failure`/report model, plus broader `StationAlert`s; live changes stream to clients over SSE.
- **Journey planning** — the app calls TfL's Journey Planner API directly and cross-references legs against live outage data, with an accessibility (step-free) preference filter.
- **Push notifications** — riders who save a journey through an affected station get an Expo push when an outage is first reported there.

Treat the accessibility-focused user (wheelchair users, mobility aids, prams) as the primary persona when weighing UX trade-offs — fast, low-friction reporting and clear, trustworthy live status matter more than feature breadth.

A full component and data-flow map lives in [`ARCHITECTURE.md`](ARCHITECTURE.md) — read it for the end-to-end picture (services, SSE broker, TfL ingest, push, journey planning).

## Repo layout

Monorepo with two self-contained subprojects. There is no top-level package manager or build script; each side is run from its own directory.

- [`backend/`](backend/CLAUDE.md) — FastAPI service (Python 3.10+, SQLAlchemy 2.x, Pydantic v2) backed by SQLite in dev and Postgres in prod. See `backend/CLAUDE.md`.
- [`frontend/`](frontend/CLAUDE.md) — React Native app on Expo SDK 54 + TypeScript, distributed via EAS. See `frontend/CLAUDE.md`.

## Cross-cutting conventions

- **Typed contract is generated, not hand-written.** The frontend's `src/api/schema.d.ts` is produced from the backend's OpenAPI schema (`npm run generate:api` in `frontend/` with the backend running locally). When you change a FastAPI route signature or a Pydantic schema, regenerate.
- **No migrations.** The backend uses `Base.metadata.create_all` at import time — there is no Alembic. Schema changes require deleting `backend/dev.db` once. Don't add backwards-compatibility hacks for old schemas; just regenerate.
- **Idempotent seeding.** `backend/app/seed.py` runs on every startup and inserts reference rows (stations, equipment types, equipment) only if missing. Tests rely on this seed data being present.

## Station data enrichment

All station data lives in `backend/app/data/stations.json` (387 stations, all TfL modes). The script `backend/seed_stations_data.py` reads this file and enriches it from TfL's step-free access CSV feed (`temp/tfl-stationdata-detailed/`). Run it whenever the CSV data or overrides change:

```bash
python3 backend/seed_stations_data.py
# then delete backend/dev.db and restart uvicorn to reseed
```

`temp/enrich_tube_stations.py` is a legacy copy of the same script kept for reference — do not use it.

### Enriched fields per station

| Field | Source |
|---|---|
| `id` | NaPTAN HUB code (or UniqueId) from TfL CSV |
| `zones` | `FareZones` (pipe-separated) |
| `wifi`, `blueBadgeParking`, `taxiRank` | CSV boolean fields |
| `interchange` | `{nationalRail, bus, pier}` with "Full"/"Partial"/"None" |
| `coordinates` | Best ground-level point from StationPoints.csv |
| `platforms[]` | Per-platform objects (see below) |
| `lift_units[]` | Named lifts from Lifts.csv; or synthesised for deep-tube stations |
| `escalator_units[]` | **MOCKED** — see note below |
| `toilets[]` | From Toilets.csv |

### Per-platform fields

Each platform carries: `id`, `name`, `direction`, `lines[]`, `stepFreeAccess`, `accessibleEntrance`, `gapMm`, `stepMm`, `boardingRamp`, `levelAccess`.

`stepFreeAccess` is derived via BFS on a step-free pathway graph (SameLevelPaths + RampRoutes + Lifts CSVs) from the station's virtual `-Outside` node. Values: `"Full"` / `"to_platform"` / `"to_train"` / `"none"`. There is **no station-level `step_free` field** — it is platform-only.

### Escalator data is mocked

TfL's step-free feed has no escalator topology data (escalators are not step-free routes). `escalator_units` are synthesised by distributing the escalator count round-robin across customer-facing platforms. Every unit is tagged `"mocked": true`. **This data is estimated and must be replaced with hand-curated data before treating as authoritative.**

### Hand-curated overrides

`backend/app/data/station_overrides.json` contains manual corrections applied **after** all CSV enrichment, so entries here always win over automated sources. Use it for:

- Lifts that exist physically but are absent from TfL's step-free feed (e.g. lifts at non-step-free stations such as Gloucester Road)
- Correcting wrong `stepFreeAccess` values on individual platforms (`platforms_patch`)
- Eventually replacing mocked escalator data with real topology

Supported fields per entry: `lift_units`, `lifts`, `escalator_units`, `escalators`, `platforms_patch` (map of `{ platform_id: { field: value } }`). The `name` field must match `stations.json` exactly. Unknown names print a warning during enrichment.

After editing the overrides file, re-run `python3 backend/seed_stations_data.py` (then delete `backend/dev.db` and restart) to regenerate `stations.json`. For quick fixes that don't need a full re-enrichment, you can patch `stations.json` directly — but keep the overrides file in sync so the next enrichment run doesn't clobber your change.
