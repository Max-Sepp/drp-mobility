# DRP Mobility

A mobile app to help mobility-impaired users travel with independence and confidence. Provides trustworthy accessibility information about TfL transit stations, live step-free access outage status (lift/escalator failures), and journey planning with automatic rerouting when accessibility issues are detected ahead.

Features:

- **Outage reports** — fast, low-friction submission and viewing of lift/escalator failures, grouped into incidents.
- **Live status** — the backend ingests TfL's disruption feed and streams changes to the app over Server-Sent Events, so status updates appear without a refresh.
- **Journey planning** — powered by TfL's Journey Planner and cross-referenced against live outage data, with a step-free preference filter.
- **Push notifications** — riders are alerted when an outage hits a station on a journey they've saved.

Imperial College Year 2 DRP (Designing for Real People) coursework. For an end-to-end picture of how the pieces fit together, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Features

- **Journey planning** — step-free accessible routes via the TfL API, with departure/arrival times and per-leg turn-by-turn guidance
- **Active journey mode** — follow a live journey step by step; GPS auto-advances legs as you arrive at stations
- **Accessibility issue detection** — monitors for reported outages on upcoming stations in your journey and surfaces a reroute prompt when a blocking issue is found
- **Rerouting** — finds alternative accessible routes from your current position, avoiding affected stations
- **Station detail** — per-station step-free access status (lift/escalator health, platform-level access grades), pulled from live outage reports
- **Outage reporting** — fast, low-friction flow for submitting lift/escalator failures with photo evidence

## Layout

```
.
├── backend/    FastAPI service (Python 3.10+, SQLAlchemy 2.x, Pydantic v2)
└── frontend/   React Native app (Expo SDK 54, TypeScript)
```

Each subproject is self-contained. See its README for full instructions.

## Getting started

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
DEV=true uvicorn app.main:app --reload
```

Serves on http://127.0.0.1:8000 (interactive docs at `/docs`). `DEV=true` enables the CORS middleware required for local frontend dev. See [`backend/README.md`](backend/README.md).

### Frontend

```bash
cd frontend
npm install
npm run start    # Metro bundler + QR code for Expo Go
```

Scan the QR code with [Expo Go](https://expo.dev/go) on a physical device, or use `npm run android` / `npm run ios` for an emulator. See [`frontend/README.md`](frontend/README.md).
