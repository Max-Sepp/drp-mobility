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
  // The intermediate stops along the leg's path, plus `lineString` — a JSON-encoded array of
  // [lat, lng] coordinate pairs (TfL order, latitude first) tracing the leg's real path along
  // the track/road. Present on transit and walking legs; used to draw the route on the map.
  path?: { stopPoints?: { name?: string }[]; lineString?: string }
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

/** A step-free walking link from one platform to another at the same station. */
type PlatformInterchange = { to: string; distance_m: number }

/** Minimal shape of a station used by the rerouting helpers. Satisfied by `StationDetail`. */
export type StationLookup = {
  name: string
  latitude?: number | null
  longitude?: number | null
  platforms: {
    name?: string
    step_free: string
    lines: string[]
    direction?: string | null
    interchange_to?: PlatformInterchange[] | null
  }[]
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

// ── "Stuck on the platform" rerouting ──────────────────────────────────────────────────────────
//
// When a rider has ridden into a station and is stranded on the platform (the lift/escalator they
// need to exit or interchange is out), the help they need is a route that STARTS from that
// platform: typically stay on / re-board and ride to the nearest step-free station, then continue
// by another mode. `planRouteFromPlatform` reasons about which platforms the rider can actually
// reach step-free (their own, plus the opposite direction / other lines reachable via a step-free
// platform interchange), rides each line to the nearest step-free station, and plans onward from
// there to the real destination.

/** Loose station-name match (same containment rule as `findStationByName`). */
function sameStationName(a: string, b: string): boolean {
  const x = normaliseStationName(a)
  const y = normaliseStationName(b)
  return x === y || x.includes(y) || y.includes(x)
}

/** Two line names refer to the same line (case/spacing-insensitive). */
function sameLineName(a: string, b: string): boolean {
  return normaliseStationName(a) === normaliseStationName(b)
}

/**
 * Normalise a TfL line name to its Journey-Planner line id, e.g. "Hammersmith & City" →
 * "hammersmith-city", "Waterloo & City" → "waterloo-city", "London Overground" →
 * "london-overground". Returns null for an empty name.
 */
function tflLineId(name: string | undefined): string | null {
  if (!name) return null
  const id = name
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return id || null
}

/** The leg mode used to render a ride on a given line (for colour/icon in the result card). */
function legModeForLine(lineName: string): string {
  const n = normaliseStationName(lineName)
  if (n.includes('elizabeth')) return 'elizabeth-line'
  if (n.includes('overground') || n.includes('liberty') || n.includes('lioness') ||
    n.includes('mildmay') || n.includes('suffragette') || n.includes('weaver') ||
    n.includes('windrush')) return 'overground'
  if (n === 'dlr') return 'dlr'
  return 'tube'
}

/** Ordered station names of one branch of a line's route sequence. */
type LineBranch = { names: string[] }

/** Cache of lineId → its route-sequence branches (line topology doesn't change within a session). */
const lineBranchCache = new Map<string, LineBranch[]>()

/**
 * Fetch a line's ordered stop sequence (one entry per branch) from TfL. Direction is irrelevant
 * for ordering — we anchor travel direction on the rider's previous stop — so we fetch `inbound`
 * only. Returns `[]` (cached) on any failure so callers degrade gracefully.
 */
async function fetchLineBranches(lineId: string): Promise<LineBranch[]> {
  const cached = lineBranchCache.get(lineId)
  if (cached) return cached
  let branches: LineBranch[] = []
  try {
    const res = await fetch(
      `${TFL_BASE}/Line/${encodeURIComponent(lineId)}/Route/Sequence/inbound?serviceTypes=Regular&excludeCrowding=true`,
    )
    if (res.ok) {
      const body = await res.json().catch(() => null)
      const seqs: { stopPoint?: { name?: string }[] }[] = body?.stopPointSequences ?? []
      branches = seqs.map((s) => ({
        names: (s.stopPoint ?? []).map((sp) => sp.name ?? '').filter((n) => n.length > 0),
      }))
    }
  } catch {
    // Leave empty; caller falls back to nearby step-free stations.
  }
  lineBranchCache.set(lineId, branches)
  return branches
}

/** The first station in `names` (in order) that exists in our data and is step-free to board. */
function firstStepFreeAlong(
  names: string[],
  stations: StationLookup[],
  excludeNorm: Set<string>,
): StationLookup | null {
  for (const name of names) {
    const s = findStationByName(stations, name)
    if (!s || excludeNorm.has(normaliseStationName(s.name))) continue
    if (hasStepFreeBoarding(s)) return s
  }
  return null
}

/** Rough on-train minutes between two points: straight-line km at ~40 km/h (stops included). */
function trainMinutes(a: LatLon, b: LatLon): number {
  return Math.max(2, Math.round((haversineKm(a, b) / 40) * 60))
}

/** A step-free station the stranded rider can ride to, and how they reach the platform for it. */
type Escape = {
  station: StationLookup
  coords: LatLon
  lineName: string
  // The platform they must cross to (step-free) first, or null when they stay where they are.
  viaPlatform: string | null
}

/** Prepend a synthetic ride leg (stuck station → escape station) onto an onward journey. */
function prependRideLeg(
  journey: Journey,
  from: { name: string; coords: LatLon },
  escape: Escape,
): Journey {
  const minutes = trainMinutes(from.coords, escape.coords)
  const firstLeg = journey.legs[0]
  const arriveStr = firstLeg?.departureTime ?? journey.startDateTime
  const departStr = toLondonLocal(new Date(parseLondonLocal(arriveStr).getTime() - minutes * 60_000))
  const summary = escape.viaPlatform
    ? `Change to ${escape.viaPlatform} (step-free), then ride to ${escape.station.name}`
    : `Stay on the ${escape.lineName} to ${escape.station.name}`
  const rideLeg: Leg = {
    duration: minutes,
    mode: { name: legModeForLine(escape.lineName) },
    instruction: { summary },
    departureTime: departStr,
    arrivalTime: arriveStr,
    departurePoint: { lat: from.coords.lat, lon: from.coords.lon, commonName: from.name },
    arrivalPoint: { lat: escape.coords.lat, lon: escape.coords.lon, commonName: escape.station.name },
    routeOptions: [{ name: escape.lineName }],
  }
  return {
    ...journey,
    startDateTime: departStr,
    duration: journey.duration + minutes,
    legs: [rideLeg, ...journey.legs],
  }
}

/** Does any transit leg of `journey` call at one of `blockedNorm` (normalised names)? */
function journeyTouchesBlocked(journey: Journey, blockedNorm: Set<string>): boolean {
  for (const leg of journey.legs) {
    if (leg.mode.name === 'walking') continue
    for (const point of [leg.departurePoint, leg.arrivalPoint]) {
      const name = point?.commonName
      if (name && [...blockedNorm].some((b) => sameStationName(name, b))) return true
    }
  }
  return false
}

/**
 * Plan routes for a rider stranded on the platform they rode in on. `currentLeg` is the leg that
 * carried them to the blocked station — its arrival point is where they're stuck, its departure
 * point fixes the direction of travel, and `routeOptions[0].name` is the line. Produces journeys
 * that ride from the platform to the nearest step-free station (staying put, or after a step-free
 * platform interchange to the opposite direction / another line), then continue to `destination`.
 */
export async function planRouteFromPlatform(
  currentLeg: Leg,
  destination: string,
  accessibility: AccessibilityPreference | null,
  blockedStationNames: string[],
  stations: StationLookup[],
): Promise<JourneyOptionsResult> {
  const stuckName = currentLeg.arrivalPoint?.commonName
  const stuckStation = stuckName ? findStationByName(stations, stuckName) : null
  const stuckCoords =
    currentLeg.arrivalPoint?.lat != null && currentLeg.arrivalPoint?.lon != null
      ? { lat: currentLeg.arrivalPoint.lat, lon: currentLeg.arrivalPoint.lon }
      : stuckStation
        ? stationCoords(stuckStation)
        : null
  if (!stuckName || !stuckStation || !stuckCoords) {
    return { kind: 'error', message: 'Could not work out which platform you are on.' }
  }

  const lineName = currentLeg.routeOptions?.[0]?.name ?? ''
  const prevName = currentLeg.departurePoint?.commonName ?? null
  const excludeNorm = new Set([normaliseStationName(stuckStation.name)])
  const escapes: Escape[] = []
  const pushEscape = (station: StationLookup, ln: string, viaPlatform: string | null) => {
    const c = stationCoords(station)
    const norm = normaliseStationName(station.name)
    if (!c || excludeNorm.has(norm)) return
    excludeNorm.add(norm)
    escapes.push({ station, coords: c, lineName: ln || lineName, viaPlatform })
  }

  // Step-free platforms the rider can reach from the platform(s) serving their line.
  const stuckPlatforms = stuckStation.platforms.filter((p) =>
    p.lines.some((l) => sameLineName(l, lineName)),
  )
  const stuckDir = stuckPlatforms.find((p) => p.direction)?.direction ?? null
  const reachableNorm = new Set(
    stuckPlatforms.flatMap((p) => (p.interchange_to ?? []).map((ic) => normaliseStationName(ic.to))),
  )
  const reachablePlatforms = stuckStation.platforms.filter(
    (p) => p.name && reachableNorm.has(normaliseStationName(p.name)),
  )
  const canCrossToOppositeSameLine = reachablePlatforms.some(
    (p) => p.lines.some((l) => sameLineName(l, lineName)) && p.direction && p.direction !== stuckDir,
  )
  const oppositePlatformName = reachablePlatforms.find(
    (p) => p.lines.some((l) => sameLineName(l, lineName)) && p.direction && p.direction !== stuckDir,
  )?.name

  // Strategy 1 — ride this line. Forward (stay on the platform) and, when a step-free crossing to
  // the opposite platform exists, backward (the way they came) too.
  const lineId = tflLineId(lineName)
  if (lineId) {
    const located = (await fetchLineBranches(lineId))
      .map((branch) => ({
        branch,
        stuckIdx: branch.names.findIndex((n) => sameStationName(n, stuckName)),
        prevIdx: prevName != null ? branch.names.findIndex((n) => sameStationName(n, prevName)) : -1,
      }))
      .filter((x) => x.stuckIdx >= 0)
    // When the previous stop pins the direction on some branch, trust only those branches — the
    // others would have to guess and could send the rider the wrong way along the line.
    const prevPinned = located.some((x) => x.prevIdx >= 0)
    for (const { branch, stuckIdx, prevIdx } of located) {
      if (prevPinned && prevIdx < 0) continue
      const after = branch.names.slice(stuckIdx + 1)
      const before = branch.names.slice(0, stuckIdx).reverse()
      // "Forward" is away from the previous stop; default to `after` when it isn't on this branch.
      const forward = prevIdx > stuckIdx ? before : after
      const backward = prevIdx > stuckIdx ? after : before
      const f = firstStepFreeAlong(forward, stations, excludeNorm)
      if (f) pushEscape(f, lineName, null)
      if (canCrossToOppositeSameLine) {
        const b = firstStepFreeAlong(backward, stations, excludeNorm)
        if (b) pushEscape(b, lineName, oppositePlatformName ?? null)
      }
    }
  }

  // Strategy 2 — change to another line via a step-free platform interchange, then ride it to the
  // nearest step-free station (either direction, since we can't fix direction on a new line).
  const otherLines = new Map<string, string>() // normalised line → { platform name, raw line }
  const otherLineInfo: { line: string; viaPlatform: string }[] = []
  for (const p of reachablePlatforms) {
    for (const l of p.lines) {
      if (sameLineName(l, lineName) || otherLines.has(normaliseStationName(l))) continue
      otherLines.set(normaliseStationName(l), l)
      if (p.name) otherLineInfo.push({ line: l, viaPlatform: p.name })
    }
  }
  for (const { line, viaPlatform } of otherLineInfo) {
    const id = tflLineId(line)
    if (!id) continue
    const branches = await fetchLineBranches(id)
    for (const branch of branches) {
      const idx = branch.names.findIndex((n) => sameStationName(n, stuckName))
      if (idx < 0) continue
      for (const side of [branch.names.slice(idx + 1), branch.names.slice(0, idx).reverse()]) {
        const s = firstStepFreeAlong(side, stations, excludeNorm)
        if (s) pushEscape(s, line, viaPlatform)
      }
    }
  }

  // Fallback — couldn't read any line sequence (network/unknown line): offer the nearest step-free
  // stations geographically, with a best-effort ride leg.
  if (escapes.length === 0) {
    for (const near of nearbyStepFreeStations(stuckCoords, stations, [stuckStation.name], 3).slice(0, 3)) {
      pushEscape(near.station, lineName, null)
    }
  }

  if (escapes.length === 0) {
    return { kind: 'error', message: 'No step-free way off this platform was found.' }
  }

  // Plan onward from each escape station to the real destination and stitch the ride leg on front.
  const blockedOtherNorm = new Set(
    blockedStationNames.map(normaliseStationName).filter((n) => !sameStationName(n, stuckName)),
  )
  const planned = await Promise.all(
    escapes.slice(0, 4).map(async (escape) => {
      const result = await planJourney(escape.station.name, destination, accessibility, null, null, true)
      if (result.kind !== 'journeys') return []
      return result.journeys
        .filter((j) => !journeyTouchesBlocked(j, blockedOtherNorm))
        .map((j) => prependRideLeg(j, { name: stuckStation.name, coords: stuckCoords }, escape))
    }),
  )

  const bySignature = new Map<string, Journey>()
  for (const journey of planned.flat()) {
    const key = routeSignature(journey)
    if (!bySignature.has(key)) bySignature.set(key, journey)
  }
  const journeys = [...bySignature.values()]
  if (journeys.length === 0) {
    return { kind: 'error', message: 'No step-free way off this platform was found.' }
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
