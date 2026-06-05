# DRP Mobility

A mobile app to help mobility-impaired users travel with independence and confidence. Provides trustworthy accessibility information about TfL transit stations and live updates on step-free access outages (lift/escalator failures), with a fast, low-friction flow for submitting and viewing outage reports.

Imperial College Year 2 DRP (Design & Realisation Project) coursework.

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
