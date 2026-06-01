# frontend/CLAUDE.md

Guidance for Claude Code when working inside `frontend/`. Top-level project context lives in the repo-root `CLAUDE.md`.

## Commands

```bash
npm install
npm run start            # Expo dev server + QR for Expo Go
npm run android          # open on Android emulator/device
npm run ios              # open on iOS simulator (macOS only)
npm run generate:api     # regenerate src/api/schema.d.ts from a backend running on :8000
```

There is no test runner configured.

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
- **`schema.d.ts` is generated.** Don't edit it by hand. After any backend route/schema change, run `npm run generate:api` against a locally running backend (`uvicorn app.main:app --reload`).
- Base URL comes from `EXPO_PUBLIC_API_URL` and defaults to `http://localhost:8000`. For physical-device testing you'll need to set this to your laptop's LAN IP, since `localhost` on the phone refers to the phone itself.

## Helpers (`src/lib/`)

- `datetime.ts` centralises the timezone handling: the backend always sends UTC ISO strings, but some don't include a trailing `Z`. `parseUtc` appends `Z` if no timezone designator is present so dates are never reinterpreted as local time. Use these helpers rather than `new Date(iso)` directly when displaying backend timestamps.

## Constants (`src/constants/`)

`stations.ts` contains client-side station data. The backend also exposes `/stations`; check whether the data you need is server-driven (fetched at runtime) or hard-coded here before duplicating.

## Distribution (EAS-only)

There is no web build. The app ships through EAS — slug `drp-mobility`, project `fa941353-94dc-490c-a5b0-209e52e4ee56`.

- **Production build** — push a `v*` tag (e.g. `v1.0.0`). The `eas-build` workflow (`.github/workflows/eas-build.yml`) builds Android + iOS and creates a GitHub Release with the `.apk`.
- **Preview build** — trigger `eas-build` manually from the Actions tab with the `preview` profile.
- **OTA update** — pushes to `main` that touch `frontend/**` trigger `eas-update.yml`, publishing a JS bundle to the `production` channel. Installed production builds pull the latest bundle on app open. **JS changes ship via OTA; native changes (new dependencies, native module config, app permissions, splash/icon) require a fresh build.**

## When working on UI

For the primary persona (wheelchair / mobility-aid users) prefer:
- Large tap targets and high contrast.
- Status language that doesn't conflate "step-free to platform" with "step-free to train."
- No colour-only status signals — pair colour with text or an icon.

If you can't test the change on a device or in Expo Go, say so explicitly rather than claiming a UI feature works.
