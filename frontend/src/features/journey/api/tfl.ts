// Thin client for the public TfL Journey Planner API. Calls go straight from the device
// to api.tfl.gov.uk (no backend hop) and carry no app_key — we accept the lower
// unauthenticated rate limit. This is deliberately NOT the openapi-fetch `apiClient`,
// which is typed to our own backend schema.

import { normaliseStationName } from '@/features/journey/api/accessibility'

const TFL_BASE = 'https://api.tfl.gov.uk'

/** A single transit mode used on a leg, e.g. `walking`, `tube`, `bus`. */
type Mode = { name: string }

/**
 * A point a leg departs from or arrives at, e.g. a station. `lat`/`lon` are passed through
 * untyped from TfL's raw response and are present at runtime on real legs (including walking
 * endpoints); they're optional because the type is also reused for persisted journey snapshots,
 * so consumers (e.g. GPS proximity in the active-journey screen) must treat them defensively.
 */
type Point = { commonName?: string; lat?: number; lon?: number; stopLetter?: string }

/** A line/route a leg runs on, e.g. `name: "Victoria"`, `directions: ["Brixton"]`. */
type RouteOption = { name?: string; directions?: string[] }

/** One leg of a journey (a continuous stretch on a single mode). */
export type Leg = {
  duration: number
  mode: Mode
  // `summary` is the one-line instruction; `detailed` is TfL's longer turn-by-turn text.
  instruction: { summary: string; detailed?: string }
  // Per-leg wall-clock times (London local, no timezone designator — see `clockTime`).
  departureTime?: string
  arrivalTime?: string
  // The stations/stops this leg runs between. Used to cross-reference our own live outage
  // data; optional because walking legs and some points may omit a name.
  departurePoint?: Point
  arrivalPoint?: Point
  // The line(s) the leg runs on.
  routeOptions?: RouteOption[]
  // The intermediate stops along the leg's path.
  path?: { stopPoints?: { name?: string }[] }
  // Disruption data returned by TfL when a leg is affected by a service disruption.
  isDisrupted?: boolean
  disruptions?: { description?: string }[]
}

/**
 * How step-free a journey must be. `StepFreeToVehicle` is fully step-free from street onto
 * the train (strictest, safest for wheelchair users); `StepFreeToPlatform` allows a
 * possible gap/step between platform and train.
 */
export type AccessibilityPreference = 'StepFreeToVehicle' | 'StepFreeToPlatform'

/**
 * Which route TfL optimises for. Querying each in turn surfaces genuinely different routes
 * (rather than the same route at different times). See `planJourneyOptions`.
 */
export type JourneyPreference = 'LeastTime' | 'LeastInterchange' | 'LeastWalking'

/** A complete door-to-door journey option returned by TfL. */
export type Journey = {
  startDateTime: string
  arrivalDateTime: string
  duration: number
  legs: Leg[]
  // Present only for journeys with a ticketed leg; `totalCost` is in pence. Walking-only
  // journeys have no fare.
  fare?: { totalCost: number }
}

/** Result of a journey plan request. */
export type JourneyPlanResult =
  | { kind: 'journeys'; journeys: Journey[] }
  | { kind: 'error'; message: string }

/** A time constraint for journey planning — either a specific departure or arrival time. */
export type TimeConstraint = { mode: 'depart'; at: Date } | { mode: 'arrive'; by: Date }

function timeQueryParams(time: TimeConstraint): string[] {
  const pad = (n: number) => String(n).padStart(2, '0')
  const d = time.mode === 'depart' ? time.at : time.by
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const t = `${pad(d.getHours())}${pad(d.getMinutes())}`
  return [
    `date=${date}`,
    `time=${t}`,
    `timeIs=${time.mode === 'depart' ? 'Departing' : 'Arriving'}`,
  ]
}

/**
 * Plan a journey between two locations. Callers pass UK postcodes (see
 * `resolveToPostcode`), which TfL resolves uniquely — so we never hit the ambiguous-text
 * "did you mean?" path. `accessibility` asks TfL to return only step-free routes; pass
 * `null`/omit it to apply no accessibility filtering (TfL then returns all modes, e.g. tube).
 * `time` constrains when to depart or arrive; omit/`null` to leave now. `preference` asks TfL to
 * optimise for a particular criterion (see `planJourneyOptions`). `includeAlternativeRoutes`
 * asks TfL to generate additional geometrically distinct routes by removing links from the
 * network — useful when the caller needs to filter out specific stations post-query.
 */
export async function planJourney(
  from: string,
  to: string,
  accessibility?: AccessibilityPreference | null,
  time?: TimeConstraint | null,
  preference?: JourneyPreference | null,
  includeAlternativeRoutes?: boolean,
  modes?: string,
): Promise<JourneyPlanResult> {
  const params: string[] = []
  if (accessibility) params.push(`accessibilityPreference=${accessibility}`)
  if (time) params.push(...timeQueryParams(time))
  if (preference) params.push(`journeyPreference=${preference}`)
  if (includeAlternativeRoutes) params.push('includeAlternativeRoutes=true')
  if (modes) params.push(`mode=${modes}`)
  const query = params.length > 0 ? `?${params.join('&')}` : ''
  const url = `${TFL_BASE}/Journey/JourneyResults/${encodeURIComponent(from)}/to/${encodeURIComponent(to)}${query}`

  let res: Response
  try {
    res = await fetch(url)
  } catch {
    return {
      kind: 'error',
      message: 'Could not reach the journey planner. Check your connection and try again.',
    }
  }

  if (res.ok) {
    const body = await res.json().catch(() => null)
    const journeys: Journey[] = body?.journeys ?? []
    if (journeys.length === 0) {
      return { kind: 'error', message: 'No journeys found between those locations.' }
    }
    return { kind: 'journeys', journeys }
  }

  // TfL surfaces a human-readable reason in `message` on 4xx (e.g. unknown location).
  const body = await res.json().catch(() => null)
  return {
    kind: 'error',
    message: body?.message ?? 'Could not plan a journey for those locations.',
  }
}

/** Why a route stands out, used to label it in the UI. */
export type RouteTag = 'fastest' | 'fewest-changes' | 'least-walking'

/** A journey paired with the optimisation criteria that surfaced it. */
export type TaggedJourney = { journey: Journey; tags: RouteTag[] }

/** Result of planning a set of distinct route options. */
export type JourneyOptionsResult =
  | { kind: 'journeys'; journeys: TaggedJourney[] }
  | { kind: 'error'; message: string }

// We query all three criteria not to read tags off them, but because each one surfaces a
// genuinely different route; the tags themselves are derived from the resulting route data
// (see `planJourneyOptions`).
const PREFERENCES: JourneyPreference[] = ['LeastTime', 'LeastInterchange', 'LeastWalking']

/** A route still earns a time-based tag if it's within this fraction of the best value. */
const TAG_TOLERANCE = 0.1

/** Total minutes spent on walking legs. */
function walkingMinutes(journey: Journey): number {
  return journey.legs
    .filter((leg) => leg.mode.name === 'walking')
    .reduce((sum, leg) => sum + leg.duration, 0)
}

/** Number of interchanges = transit (non-walking) legs minus one, floored at zero. */
function changeCount(journey: Journey): number {
  const transitLegs = journey.legs.filter((leg) => leg.mode.name !== 'walking').length
  return Math.max(0, transitLegs - 1)
}

/**
 * A route's identity, independent of departure time: the ordered transit legs keyed by their
 * boarding and alighting stations. Two journeys with the same signature are the same route
 * leaving at different times.
 *
 * Keyed on stations rather than line name on purpose: parallel lines that share the same track
 * (e.g. District vs Circle between St. James's Park and Westminster) board and alight at the
 * same stations, so TfL returns them as separate journeys minutes apart — but to a rider they
 * are the same route, taken on whichever train comes first. Comparing the stations collapses
 * them. Walking legs are reduced to a marker; they're connective and their named endpoints (raw
 * addresses) vary between otherwise-identical journeys.
 *
 * Exported so callers can deduplicate against a known journey (e.g. exclude the current route
 * when surfacing rerouting alternatives).
 */
export function routeSignature(journey: Journey): string {
  return journey.legs
    .map((leg) =>
      leg.mode.name === 'walking'
        ? 'walk'
        : `${leg.mode.name}:${leg.departurePoint?.commonName ?? ''}>${leg.arrivalPoint?.commonName ?? ''}`,
    )
    .join('>')
}

/**
 * Plan a set of genuinely different routes by asking TfL for each of its optimisation criteria in
 * parallel (fastest / fewest changes / least walking), then collapsing the time-shifted repeats
 * each criterion returns. Tags are then derived from the actual route data — each metric's
 * winner (and anything tied with it, within `TAG_TOLERANCE` for the time-based ones) earns the
 * tag — rather than from whichever criterion happened to surface the route. Accessibility and
 * departure-time preferences are applied to every query. Succeeds on partial results; errors
 * only if all fail.
 *
 * Pass `includeAlternativeRoutes: true` to ask TfL to generate additional geometrically distinct
 * routes (by removing links from its network model). Useful when the caller needs a broader set
 * to filter against — e.g. finding alternatives that avoid a station with a reported outage.
 */
export async function planJourneyOptions(
  from: string,
  to: string,
  accessibility?: AccessibilityPreference | null,
  time?: TimeConstraint | null,
  includeAlternativeRoutes?: boolean,
): Promise<JourneyOptionsResult> {
  const results = await Promise.all(
    PREFERENCES.map((preference) =>
      planJourney(from, to, accessibility, time, preference, includeAlternativeRoutes),
    ),
  )

  // Merge in preference order, de-duplicating by route signature. The first criterion to surface
  // a route owns the representative journey used for its displayed numbers and tag metrics.
  const bySignature = new Map<string, Journey>()
  let lastError = 'No journeys found between those locations.'
  for (const result of results) {
    if (result.kind !== 'journeys') {
      lastError = result.message
      continue
    }
    for (const journey of result.journeys) {
      const key = routeSignature(journey)
      if (!bySignature.has(key)) bySignature.set(key, journey)
    }
  }

  const journeys = [...bySignature.values()]
  if (journeys.length === 0) return { kind: 'error', message: lastError }

  // Derive tags from the actual routes: the best on each metric (plus anything tied within
  // TAG_TOLERANCE for the time-based ones) earns the tag.
  const minDuration = Math.min(...journeys.map((j) => j.duration))
  const minWalking = Math.min(...journeys.map(walkingMinutes))
  const minChanges = Math.min(...journeys.map(changeCount))

  const tagged: TaggedJourney[] = journeys.map((journey) => {
    const tags: RouteTag[] = []
    // Order matters: matches RouteTags display order (fastest, fewest-changes, least-walking).
    if (journey.duration <= minDuration * (1 + TAG_TOLERANCE)) tags.push('fastest')
    if (changeCount(journey) === minChanges) tags.push('fewest-changes')
    if (walkingMinutes(journey) <= minWalking * (1 + TAG_TOLERANCE)) tags.push('least-walking')
    return { journey, tags }
  })
  return { kind: 'journeys', journeys: tagged }
}

/** Minimal shape of a station used by the rerouting helpers. Satisfied by `StationDetail`. */
export type StationLookup = {
  name: string
  latitude?: number | null
  longitude?: number | null
  platforms: { step_free: string; lines: string[] }[]
}

type LatLon = { lat: number; lon: number }

/** Great-circle distance in kilometres between two points (Haversine). */
function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function stationCoords(s: StationLookup): LatLon | null {
  return s.latitude != null && s.longitude != null ? { lat: s.latitude, lon: s.longitude } : null
}

/** Match a TfL `commonName` against the station list using the same loose containment rule as `resolveStationName`. */
function findStationByName(stations: StationLookup[], tflName: string): StationLookup | null {
  const target = normaliseStationName(tflName)
  const exact = stations.find((s) => normaliseStationName(s.name) === target)
  if (exact) return exact
  return (
    stations.find((s) => {
      const n = normaliseStationName(s.name)
      return n.includes(target) || target.includes(n)
    }) ?? null
  )
}

/**
 * A station is a safe rerouting destination for a wheelchair user when at least one platform is
 * either fully step-free OR step-free to the train (both mean no step onto the train).
 */
function hasStepFreeBoarding(s: StationLookup): boolean {
  return s.platforms.some((p) => p.step_free === 'full' || p.step_free === 'to_train')
}

/** A station serves ≥ 2 lines across its platforms — i.e. you can change lines here. */
function isInterchange(s: StationLookup): boolean {
  return new Set(s.platforms.flatMap((p) => p.lines)).size >= 2
}

/**
 * Step-free stations within `maxKm` of the anchor, sorted nearest first, excluding any whose name
 * is in `excludeNames` (typically the blocked station itself).
 */
function nearbyStepFreeStations(
  anchor: LatLon,
  stations: StationLookup[],
  excludeNames: string[],
  maxKm: number,
): { station: StationLookup; coords: LatLon; distanceKm: number }[] {
  const excludeNorm = new Set(excludeNames.map(normaliseStationName))
  const out: { station: StationLookup; coords: LatLon; distanceKm: number }[] = []
  for (const s of stations) {
    if (excludeNorm.has(normaliseStationName(s.name))) continue
    if (!hasStepFreeBoarding(s)) continue
    const c = stationCoords(s)
    if (!c) continue
    const d = haversineKm(anchor, c)
    if (d <= maxKm) out.push({ station: s, coords: c, distanceKm: d })
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm)
  return out
}

/**
 * Walking forward from the user's current leg, find the last interchange station they will pass
 * through before reaching any blocked station. Returns the station name as TfL knows it, suitable
 * to pass back to the journey planner, or null when there's no interchange before the block.
 *
 * Replanning from a real interchange surfaces genuine line-switching alternatives — something
 * that querying from a non-interchange intermediate stop cannot produce.
 */
function lastInterchangeBefore(
  legs: Leg[],
  fromLegIndex: number,
  blockedStationNames: string[],
  stations: StationLookup[],
): string | null {
  const blockedNorm = blockedStationNames.map(normaliseStationName)
  const matchesBlocked = (name: string) => {
    const n = normaliseStationName(name)
    return blockedNorm.some((b) => n.includes(b) || b.includes(n))
  }

  let last: string | null = null
  for (let i = fromLegIndex; i < legs.length; i++) {
    const leg = legs[i]
    if (leg.mode.name === 'walking') continue
    const points: string[] = []
    if (leg.departurePoint?.commonName) points.push(leg.departurePoint.commonName)
    for (const sp of leg.path?.stopPoints ?? []) {
      if (sp.name) points.push(sp.name)
    }
    for (const name of points) {
      if (matchesBlocked(name)) return last
      const s = findStationByName(stations, name)
      if (s && isInterchange(s)) last = name
    }
  }
  return last
}

/** TfL local-wallclock time format ("YYYY-MM-DDTHH:MM:SS", no timezone). */
function toLondonLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** Parse a TfL local-wallclock string into a Date whose components match (no UTC shift). */
function parseLondonLocal(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return new Date(s)
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
}

/** Straight-line distance × 1.3 (street-routing fudge) ÷ 5 km/h walking speed, in whole minutes. */
function walkMinutes(from: LatLon, to: LatLon): number {
  const distKm = haversineKm(from, to)
  return Math.max(1, Math.round(((distKm * 1.3) / 5) * 60))
}

/** A single-leg walking-only Journey from origin to destination. */
function synthesizeWalkJourney(origin: LatLon, dest: LatLon): Journey {
  const minutes = walkMinutes(origin, dest)
  const start = new Date()
  const end = new Date(start.getTime() + minutes * 60_000)
  const startStr = toLondonLocal(start)
  const endStr = toLondonLocal(end)
  return {
    startDateTime: startStr,
    arrivalDateTime: endStr,
    duration: minutes,
    legs: [
      {
        duration: minutes,
        mode: { name: 'walking' },
        instruction: { summary: `Walk to destination (approx. ${minutes} min)` },
        departureTime: startStr,
        arrivalTime: endStr,
        departurePoint: { lat: origin.lat, lon: origin.lon, commonName: 'Your location' },
        arrivalPoint: { lat: dest.lat, lon: dest.lon, commonName: 'Destination' },
      },
    ],
  }
}

/** Append a synthetic walking leg from `from` to `destCoords` onto `journey`, extending duration / arrival. */
function appendWalkingLeg(
  journey: Journey,
  from: { name: string; coords: LatLon },
  destCoords: LatLon,
): Journey {
  const minutes = walkMinutes(from.coords, destCoords)
  const lastLeg = journey.legs[journey.legs.length - 1]
  const prevArrivalStr = lastLeg?.arrivalTime ?? journey.arrivalDateTime
  const prevArrival = parseLondonLocal(prevArrivalStr)
  const newArrival = new Date(prevArrival.getTime() + minutes * 60_000)
  const newArrivalStr = toLondonLocal(newArrival)
  const walkLeg: Leg = {
    duration: minutes,
    mode: { name: 'walking' },
    instruction: { summary: `Walk to destination (approx. ${minutes} min)` },
    departureTime: prevArrivalStr,
    arrivalTime: newArrivalStr,
    departurePoint: { lat: from.coords.lat, lon: from.coords.lon, commonName: from.name },
    arrivalPoint: { lat: destCoords.lat, lon: destCoords.lon, commonName: 'Destination' },
  }
  return {
    ...journey,
    duration: journey.duration + minutes,
    arrivalDateTime: newArrivalStr,
    legs: [...journey.legs, walkLeg],
  }
}

/**
 * Find alternative routes when a station on the user's current journey has reported accessibility
 * outages. Runs three strategies in parallel and merges:
 *
 * - **Substitute destination (A)**: pick step-free stations near the blocked one (from our own
 *   `stations.json`), plan to each, then synthesise a final walking leg to the original destination.
 *   Lets the rider end at a different (working) station and walk the last stretch.
 * - **Earlier interchange (B)**: identify the last interchange the rider will pass through before
 *   the block, then replan from there to the original destination with all modes enabled and
 *   `includeAlternativeRoutes=true`. Gives TfL the room to surface a real line-switch.
 * - **Walk fallback (C)**: a single walking-only journey from origin to destination, always
 *   included as a safety net so the alternatives sheet is never empty.
 *
 * `originCoords` is the rider's current position (GPS); `destCoords` are the coordinates of the
 * journey's true destination. Either can be null — strategies needing them will silently skip.
 * Results are deduplicated by route signature and tagged (fastest / fewest-changes / least-walking).
 */
export async function planAlternativesAlongLine(
  legs: Leg[],
  fromLegIndex: number,
  destination: string,
  accessibility: AccessibilityPreference | null,
  blockedStationNames: string[],
  stations: StationLookup[],
  originCoords: LatLon | null,
  destCoords: LatLon | null,
): Promise<JourneyOptionsResult> {
  // Strategy A — substitute destination
  const strategyA: Promise<Journey[]> = (async () => {
    if (!originCoords || !destCoords || blockedStationNames.length === 0) return []
    // Anchor on the blocked station's known coordinates so substitutes cluster near it. Fall back
    // to the rider's destination if we don't recognise the blocked station name.
    const blockedCoords = blockedStationNames
      .map((n) => {
        const s = findStationByName(stations, n)
        return s ? stationCoords(s) : null
      })
      .filter((c): c is LatLon => c !== null)
    const anchor = blockedCoords[0] ?? destCoords
    const substitutes = nearbyStepFreeStations(anchor, stations, blockedStationNames, 1.5).slice(
      0,
      3,
    )
    if (substitutes.length === 0) return []
    const originStr = `${originCoords.lat},${originCoords.lon}`
    const results = await Promise.all(
      substitutes.map((sub) =>
        planJourney(originStr, sub.station.name, accessibility, null, null, true),
      ),
    )
    const out: Journey[] = []
    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const sub = substitutes[i]
      if (result.kind !== 'journeys') continue
      for (const journey of result.journeys) {
        out.push(
          appendWalkingLeg(journey, { name: sub.station.name, coords: sub.coords }, destCoords),
        )
      }
    }
    return out
  })()

  // Strategy B — earlier interchange
  const strategyB: Promise<Journey[]> = (async () => {
    if (blockedStationNames.length === 0) return []
    const interchange = lastInterchangeBefore(legs, fromLegIndex, blockedStationNames, stations)
    if (!interchange) return []
    const result = await planJourney(interchange, destination, accessibility, null, null, true)
    return result.kind === 'journeys' ? result.journeys : []
  })()

  // Strategy C — walking fallback (always included when we have both endpoints)
  const strategyC: Journey[] =
    originCoords && destCoords ? [synthesizeWalkJourney(originCoords, destCoords)] : []

  const [resultsA, resultsB] = await Promise.all([strategyA, strategyB])

  const bySignature = new Map<string, Journey>()
  for (const journey of [...resultsA, ...resultsB, ...strategyC]) {
    const key = routeSignature(journey)
    if (!bySignature.has(key)) bySignature.set(key, journey)
  }

  const journeys = [...bySignature.values()]
  if (journeys.length === 0) {
    return { kind: 'error', message: 'No alternative routes found.' }
  }

  const minDuration = Math.min(...journeys.map((j) => j.duration))
  const minWalking = Math.min(...journeys.map(walkingMinutes))
  const minChanges = Math.min(...journeys.map(changeCount))

  const tagged: TaggedJourney[] = journeys.map((journey) => {
    const tags: RouteTag[] = []
    if (journey.duration <= minDuration * (1 + TAG_TOLERANCE)) tags.push('fastest')
    if (changeCount(journey) === minChanges) tags.push('fewest-changes')
    if (walkingMinutes(journey) <= minWalking * (1 + TAG_TOLERANCE)) tags.push('least-walking')
    return { journey, tags }
  })

  return { kind: 'journeys', journeys: tagged }
}
