# frontend/CLAUDE.md

Guidance for Claude Code when working inside `frontend/`. Top-level project context lives in the repo-root `CLAUDE.md`.

## Commands

```bash
npm install
npm run start            # Expo dev server + QR for Expo Go
npm run android          # open on Android emulator/device
npm run ios              # open on iOS simulator (macOS only)
npm run generate:api     # regenerate src/api/schema.d.ts from a backend running on :8000
npm run lint             # ESLint (eslint-config-expo, flat config in eslint.config.js)
npm run lint:fix         # ESLint with autofix
npm run format           # Prettier write across the repo
npm run format:check     # Prettier check only (CI-friendly)
```

There is no test runner configured.

Linting is ESLint 9 + `eslint-config-expo` (pinned to ESLint 9 — `eslint-plugin-react` isn't ESLint-10-ready). Formatting is Prettier (`.prettierrc.json`: single quotes, no semicolons, 100 cols), with `eslint-config-prettier` disabling stylistic ESLint rules so the two don't conflict. The generated `src/api/schema.d.ts` is excluded from both. `react-hooks/set-state-in-effect` is set to `warn`, not error.

## Entry and providers (`App.tsx`)

The provider stack, outside-in, is:

```
TamaguiProvider (light theme)
  └─ SafeAreaProvider
       └─ NavigationContainer
            └─ RootNavigator
```

When adding global context (auth, theming, query client, etc.), insert it inside `TamaguiProvider` so Tamagui themes are available everywhere, but outside `NavigationContainer` unless the context legitimately depends on navigation state.

## Navigation (`src/navigation/`)

- `RootNavigator.tsx` is a single native stack. All screens live in `src/screens/`.
- Route params are typed in `types.ts` as `RootStackParamList`. **Keep this in sync** when adding a screen or changing the params a screen accepts — the typed `navigation.navigate('X', params)` calls depend on it.
- `stationPicker.ts` holds shared logic for the station-picking flow that's reused across screens.

## UI components (`src/components/`)

These are app-level building blocks (`FormScreenLayout`, `ScreenHeader`, `SubmitBar`, `PhotoPicker`, etc.), composed from Tamagui primitives. Prefer composing one of these over reaching for raw `View`/`Text`. The form screens (`ReportFormScreen`, `ReportCustomScreen`) are wrapped in `FormScreenLayout` and use `KeyboardAvoidingView` semantics handled inside it — don't add another `KeyboardAvoidingView` outside.

## API client (`src/api/`)

- `client.ts` wraps `openapi-fetch` with the types from `schema.d.ts`. Use it via the typed paths — don't construct fetches by hand.
- **`schema.d.ts` is generated.** Don't edit it by hand. After any backend route/schema change, run `npm run generate:api` against a locally running backend (`DEV=true uvicorn app.main:app --reload`).
- Base URL comes from `EXPO_PUBLIC_API_URL` and defaults to `http://localhost:8000`. For physical-device testing you'll need to set this to your laptop's LAN IP, since `localhost` on the phone refers to the phone itself.

## Helpers (`src/lib/`)

- `datetime.ts` centralises the timezone handling: the backend always sends UTC ISO strings, but some don't include a trailing `Z`. `parseUtc` appends `Z` if no timezone designator is present so dates are never reinterpreted as local time. Use these helpers rather than `new Date(iso)` directly when displaying backend timestamps.
- `LocationContext.tsx` provides a `LocationProvider` (wrap at app root) plus two hooks: `useAppLocation()` → `{ latitude, longitude, ... } | null` and `useAppHeading()` → `number | null` (degrees clockwise from true north). Both return `null` until permission is granted. The provider runs `watchPositionAsync` and `watchHeadingAsync` in a single effect; heading prefers `trueHeading` and falls back to `magHeading`.

## Constants (`src/constants/`)

`stations.ts` contains client-side station data. The backend also exposes `/stations`; check whether the data you need is server-driven (fetched at runtime) or hard-coded here before duplicating.

## Backend station/equipment data

The backend seeds rich per-station data from `backend/app/data/stations.json` (enriched from TfL's step-free access CSV feed). Key points for frontend work:

- **Step-free access is per-platform** (`stepFreeAccess` on each platform): `"Full"` / `"to_platform"` / `"to_train"` / `"none"`. There is no station-level step-free field.
- **Named lift equipment** rows have descriptive `connection` strings (e.g. `"Lift A: Booking Hall → Westbound Platform 1"`).
- **Named escalator equipment** rows exist but are **mocked** — the TfL feed has no escalator topology. The connections are synthesised estimates (`"Escalator 1: Street → Northbound Platform 2"`). Do not present them as authoritative routing information.

## Distribution (EAS-only)

There is no web build. The app ships through EAS — slug `drp-mobility`, project `fa941353-94dc-490c-a5b0-209e52e4ee56`.

- **Production build** — push a `v*` tag (e.g. `v1.0.0`). The `eas-build` workflow (`.github/workflows/eas-build.yml`) builds Android + iOS and creates a GitHub Release with the `.apk`.
- **Preview build** — trigger `eas-build` manually from the Actions tab with the `preview` profile.
- **OTA update** — pushes to `main` that touch `frontend/**` trigger `eas-update.yml`, publishing a JS bundle to the `production` channel. Installed production builds pull the latest bundle on app open. **JS changes ship via OTA; native changes (new dependencies, native module config, app permissions, splash/icon) require a fresh build.**

## Map (`src/features/map/`)

- `StationMap.tsx` renders a `react-native-maps` `MapView` (works in Expo Go — no EAS build needed). On Android, tapping a TfL POI fires `onPoiClick`; iOS POI tapping is a known pending issue.
- Station lookup on POI click uses a combined distance threshold (150 m) + fuzzy name match (score ≥ 0.4) against `src/features/map/data/stationMarkers.json` — a static bundle of all 387 stations (name, lat, lng, lines) committed to the repo. Map markers always work offline; the bundle is the source of truth for the map, not `useStations()`.
- `UserLocationMarker.tsx` renders a custom `Marker` with a blue dot and a semi-transparent directional cone that rotates with the device heading. The cone is only shown when `useAppHeading()` returns a non-null value.
- `StationMap.web.tsx` is a stub that renders `MapPlaceholder` — `react-native-maps` is native-only and the web bundler would otherwise fail.

## Theme (`src/theme.ts`)

All design tokens live here — import from `@/theme`, never hardcode values in components. Exports:

| Export | Contents |
|---|---|
| `Colors` | Palette + semantic colours |
| `Radii` | Border radii (`card`, `button`, `input`, `pill`, `small`, `xs`, `handle`, `icon`) |
| `Shadows` | `card`, `heavy`, `top`, `marker` — hard-offset for neo-brutalist, soft blur for default |
| `Borders` | `thin`, `medium`, `thick` |
| `Opacity` | `disabled`, `disabledMid`, `subtle`, `pressed`, `pressedLight` — use for all interactive state opacity instead of hardcoding |
| `Overlays` | `backdrop` — modal/sheet backdrop colour |
| `Typography` | Font size + weight presets |
| `Spacing` | 4 pt grid (`xs` → `section`) |
| `Heights` | `button`, `touchTarget` |
| `SharedStyles` | Common `StyleSheet` fragments (`card`, `row`, `screenBackground`) |

## When working on UI

For the primary persona (wheelchair / mobility-aid users) prefer:

- Large tap targets and high contrast.
- Status language that doesn't conflate "step-free to platform" with "step-free to train."
- No colour-only status signals — pair colour with text or an icon.

If you can't test the change on a device or in Expo Go, say so explicitly rather than claiming a UI feature works.
