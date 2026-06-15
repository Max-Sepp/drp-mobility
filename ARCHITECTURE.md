# System Architecture

## Top-level components

- **Mobile App** — React Native / Expo SDK 54, TypeScript, distributed via EAS
- **Backend API** — FastAPI (Python 3.10+), SQLAlchemy 2.x, runs on a single uvicorn worker
- **Database** — SQLite in dev, PostgreSQL in prod; no migrations (schema created via `create_all` at startup)
- **TfL Unified API** — external, `api.tfl.gov.uk`; polled by the backend AND called directly by the app
- **Expo Push Notification Service** — external, `exp.host/--/api/v2/push/send`; called by the backend to deliver push notifications

---

## Backend internal structure

### Entry point & lifecycle (`app/main.py`)
- Boots: creates all DB tables, runs `seed_defaults` (stations, equipment types, equipment from `stations.json`)
- Spawns a background async loop: polls TfL Disruptions API every 10 minutes (configurable via `TFL_POLL_INTERVAL`, default 600s)
- Binds the in-memory SSE event broker to the running asyncio event loop
- Middleware: GZip (large `/stations` payload: ~400 KB → ~60 KB), CORS (dev only)

### Routers (REST API)
- `POST/GET /auth/signup`, `/auth/login`, `/auth/logout`, `GET/PATCH /auth/me` — session-token auth
- `GET /stations` — full enriched station list (platforms, lifts, escalators, step-free access)
- `POST/GET /outage-reports`, `GET /outage-reports/stream` (SSE), `DELETE`, image upload/download
- `GET /failures`, `PATCH /failures/{id}/resolve`, `PATCH /failures/{id}/verify`
- `GET /station-alerts`, `PATCH /station-alerts/{id}/dismiss`
- `GET/POST/DELETE /journeys` — saved journeys per user
- `GET/POST /saved-places`, `GET/POST /recent-locations`
- `GET /equipment`, `GET /equipment-types`
- `POST /admin/ingest` — manually trigger a TfL ingest run

### Services
- `services/tfl.py` — thin HTTP client; wraps `GET /Disruptions/Lifts/v2` and `GET /StopPoint/Mode/{modes}/Disruption` from TfL; configured via `TFL_API_BASE` and `TFL_APP_KEY` env vars
- `services/tfl_ingest.py` — maps TfL disruption payloads to internal models; creates/resolves `Failure` rows and `OutageReport` rows (source=`"tfl"`, pre-verified) for matched lifts; creates/clears `StationAlert` rows for unmatched or broader alerts; enforces privilege ordering (human authoritative close is never overridden by the automated feed); publishes SSE events after each change
- `services/notifications.py` — called as a FastAPI `BackgroundTask` after the first outage report for a piece of equipment; looks up users whose saved journeys touch the affected station; batches Expo Push API calls
- `services/station_matching.py` — normalises station names (e.g. `"King's Cross"` matches TfL's `"King's Cross St. Pancras Underground Station"`) for both ingest and notification dispatch

### Event broker (`app/events.py`)
- In-memory async pub/sub (`OutageEventBroker`)
- `publish()` is thread-safe (called from sync threadpool endpoints via `call_soon_threadsafe`)
- `GET /outage-reports/stream` holds an open HTTP connection; each subscriber gets a queue drained as SSE frames
- Single-process only — a multi-worker deployment would need Redis pub/sub or Postgres LISTEN/NOTIFY

### Data layer
- SQLAlchemy models: `User`, `Session`, `Station`, `Platform`, `Equipment`, `EquipmentType`, `Failure`, `OutageReport`, `OutageReportVerification`, `OutageReportDeletion`, `StationAlert`, `SavedJourney`, `SavedPlace`, `RecentLocation`, `PushToken`, `Line`
- Repository pattern: one class per model (`StationRepository`, `FailureRepository`, etc.)
- `app/http_cache.py` — in-process caching for repeated TfL HTTP requests within a single ingest run

### Station data pipeline (offline / setup-time)
- Source: TfL step-free CSV feed in `temp/tfl-stationdata-detailed/`
- Script: `backend/seed_stations_data.py` — enriches 387 stations with zones, platforms, step-free access (BFS on pathway graph), lifts, escalators (mocked), toilets, coordinates, interchange info → writes to `backend/app/data/stations.json`
- Overrides: `backend/app/data/station_overrides.json` — hand-curated corrections applied last, always win over CSV data
- At runtime: `seed.py` reads `stations.json` and inserts into DB if rows are missing

---

## Frontend internal structure

### Navigation
- Root stack: `MapHomeScreen` (primary) → `Login` / `Signup` / `Account` (pushed modally)
- All product flows (station detail, journey planning, outage reporting) live inside bottom sheets rendered by `MapHomeScreen`, not separate screens

### Features
- `features/home` — map screen, `ActiveJourneySheet` (live tracking during a journey)
- `features/map` — `StationMap` (Mapbox/native), `StationMarker`, `UserLocationMarker`; station tap opens `StationSheet`
- `features/stations` — `StationSheet`, step-free status helpers, line colours
- `features/journey` — journey search, TfL Journey Planner API client (`api/tfl.ts`), accessibility cross-reference (`api/accessibility.ts`)
- `features/reporting` — outage report submission form
- `features/outages` — outage list, SSE stream subscription
- `features/auth` — login/signup forms, `AuthContext`, push token registration
- `features/crowding` — station crowding info

### API client
- `api/client.ts` — `openapi-fetch` typed against the generated `api/schema.d.ts`; attaches Bearer token on every request
- `api/schema.d.ts` — generated from the backend's OpenAPI spec (`npm run generate:api` with backend running); must be regenerated whenever backend routes/schemas change
- `lib/offline.ts` — offline detection
- `api/cachedResource.ts` — local caching for infrequently-changing data

### Contexts
- `LocationContext` — device GPS position
- `AuthContext` — current user, session token (stored locally)
- `AccessibilityPreferenceContext` — user's step-free preference (filters journey results)
- `WorkShiftContext` — shift-mode awareness
- `MobilityStyleContext` / `ThemeContext` — theming

### Push notifications
- `hooks/usePushNotifications.ts` — requests Expo push token, registers it with the backend, handles notification tap → deep-links to the affected station's `StationSheet`

---

## Data flows (key paths)

### User submits an outage report
1. App → `POST /outage-reports` (with optional image)
2. Backend creates `OutageReport` + opens/updates `Failure` row
3. Backend publishes SSE event → all open `/outage-reports/stream` subscribers receive it immediately
4. Backend schedules `BackgroundTask: notify_affected_users` → queries saved journeys → calls Expo Push API → users receive push notification
5. Push notification tap → deep-links to station sheet in the app

### TfL disruption ingest (every 10 min)
1. Backend polls `TfL /Disruptions/Lifts/v2` and `TfL /StopPoint/Mode/.../Disruption`
2. Matched lift disruptions → `Failure` + `OutageReport` (source=`tfl`)
3. Unmatched / broader disruptions → `StationAlert`
4. Resolved disruptions → failures closed, alerts cleared
5. Human authoritative closes are never overridden
6. SSE events published for each change → connected app clients update live

### Journey planning
1. User types origin/destination in app
2. App calls **TfL Journey Planner API directly** (`api.tfl.gov.uk`) — no backend hop
3. App cross-references returned legs against live outage data from its own backend
4. User saves a journey → `POST /journeys` to backend (stored for push notification targeting)

### Station data load
- Offline: CSV → `seed_stations_data.py` → `stations.json` + overrides
- On server start: `seed.py` inserts from `stations.json` if missing
- App loads all stations: `GET /stations` (GZip-compressed, ~60 KB on wire)

---

## External connections summary

| From | To | Protocol | Purpose |
|---|---|---|---|
| App | Backend API | HTTPS REST + SSE | All user data, reports, auth, stations |
| App | `api.tfl.gov.uk` | HTTPS REST | Journey planning (direct, no backend hop) |
| Backend poll loop | `api.tfl.gov.uk` | HTTPS REST | Disruption feed ingestion |
| Backend background task | `exp.host` Expo Push API | HTTPS REST | Push notifications to affected users |
| App | Expo notification service | OS push channel | Receiving push notifications |
