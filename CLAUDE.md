# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Imperial College Year 2 DRP (Design & Realisation Project) coursework — a student-team prototype, not a production product.

The app's goal is to help mobility-impaired users travel with independence and confidence by giving them trustworthy accessibility information about transit stations and live updates on outages that affect step-free access (e.g. lifts and escalators failing). The current backend models this as user-submitted **outage reports** attached to a station's equipment; the mobile app's flow is centred on a rider quickly submitting and viewing these. Treat the accessibility-focused user (wheelchair users, mobility aids, prams) as the primary persona when weighing UX trade-offs — fast, low-friction reporting and clear, trustworthy live status matter more than feature breadth.

## Repo layout

Monorepo with two self-contained subprojects. There is no top-level package manager or build script; each side is run from its own directory.

- [`backend/`](backend/CLAUDE.md) — FastAPI service (Python 3.10+, SQLAlchemy 2.x, Pydantic v2) backed by SQLite in dev and Postgres in prod. See `backend/CLAUDE.md`.
- [`frontend/`](frontend/CLAUDE.md) — React Native app on Expo SDK 54 + TypeScript, distributed via EAS. See `frontend/CLAUDE.md`.

## Cross-cutting conventions

- **Typed contract is generated, not hand-written.** The frontend's `src/api/schema.d.ts` is produced from the backend's OpenAPI schema (`npm run generate:api` in `frontend/` with the backend running locally). When you change a FastAPI route signature or a Pydantic schema, regenerate.
- **No migrations.** The backend uses `Base.metadata.create_all` at import time — there is no Alembic. Schema changes require deleting `backend/dev.db` once. Don't add backwards-compatibility hacks for old schemas; just regenerate.
- **Idempotent seeding.** `backend/app/seed.py` runs on every startup and inserts reference rows (stations, equipment types, equipment) only if missing. Tests rely on this seed data being present.
