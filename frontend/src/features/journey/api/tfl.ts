// Thin client for the public TfL Journey Planner API. Calls go straight from the device
// to api.tfl.gov.uk (no backend hop) and carry no app_key — we accept the lower
// unauthenticated rate limit. This is deliberately NOT the openapi-fetch `apiClient`,
// which is typed to our own backend schema.

const TFL_BASE = 'https://api.tfl.gov.uk'

/** A single transit mode used on a leg, e.g. `walking`, `tube`, `bus`. */
type Mode = { name: string }

/** A point a leg departs from or arrives at, e.g. a station. */
type Point = { commonName?: string }

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

/**
 * TfL's `date` (yyyyMMdd) + `time` (HHmm) query params for a departure time. TfL works in
 * London local time and our times are device-local (we assume a London device, as elsewhere),
 * so read the wall-clock components straight off the Date.
 */
function departureParams(departAt: Date): string[] {
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = `${departAt.getFullYear()}${pad(departAt.getMonth() + 1)}${pad(departAt.getDate())}`
  const time = `${pad(departAt.getHours())}${pad(departAt.getMinutes())}`
  return [`date=${date}`, `time=${time}`, 'timeIs=Departing']
}

/**
 * Plan a journey between two locations. Callers pass UK postcodes (see
 * `resolveToPostcode`), which TfL resolves uniquely — so we never hit the ambiguous-text
 * "did you mean?" path. `accessibility` asks TfL to return only step-free routes; pass
 * `null`/omit it to apply no accessibility filtering (TfL then returns all modes, e.g. tube).
 * `departAt` plans for leaving at that time; omit/`null` to leave now. `preference` asks TfL to
 * optimise for a particular criterion (see `planJourneyOptions`).
 */
export async function planJourney(
  from: string,
  to: string,
  accessibility?: AccessibilityPreference | null,
  departAt?: Date | null,
  preference?: JourneyPreference | null,
): Promise<JourneyPlanResult> {
  const params: string[] = []
  if (accessibility) params.push(`accessibilityPreference=${accessibility}`)
  if (departAt) params.push(...departureParams(departAt))
  if (preference) params.push(`journeyPreference=${preference}`)
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

const PREFERENCES: { preference: JourneyPreference; tag: RouteTag }[] = [
  { preference: 'LeastTime', tag: 'fastest' },
  { preference: 'LeastInterchange', tag: 'fewest-changes' },
  { preference: 'LeastWalking', tag: 'least-walking' },
]

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
 */
function routeSignature(journey: Journey): string {
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
 * each criterion returns. Each distinct route keeps the tags of every criterion that surfaced it,
 * so a route can be both "Fastest" and "Fewest changes". Accessibility and departure-time
 * preferences are applied to every query. Succeeds on partial results; errors only if all fail.
 */
export async function planJourneyOptions(
  from: string,
  to: string,
  accessibility?: AccessibilityPreference | null,
  departAt?: Date | null,
): Promise<JourneyOptionsResult> {
  const results = await Promise.all(
    PREFERENCES.map(({ preference }) => planJourney(from, to, accessibility, departAt, preference)),
  )

  // Merge in preference order, de-duplicating by route signature. The first criterion to surface a
  // route owns the representative journey; later criteria just add their tag.
  const bySignature = new Map<string, TaggedJourney>()
  let lastError = 'No journeys found between those locations.'
  results.forEach((result, i) => {
    if (result.kind !== 'journeys') {
      lastError = result.message
      return
    }
    const { tag } = PREFERENCES[i]
    for (const journey of result.journeys) {
      const key = routeSignature(journey)
      const existing = bySignature.get(key)
      if (existing) {
        if (!existing.tags.includes(tag)) existing.tags.push(tag)
      } else {
        bySignature.set(key, { journey, tags: [tag] })
      }
    }
  })

  const journeys = [...bySignature.values()]
  if (journeys.length === 0) return { kind: 'error', message: lastError }
  return { kind: 'journeys', journeys }
}
