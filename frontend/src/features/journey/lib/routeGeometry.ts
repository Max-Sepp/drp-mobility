// Turns a TfL `Journey` into renderable map geometry: a coloured polyline per leg plus
// board / alight / interchange marker points. The geometry comes from each leg's
// `path.lineString` (a JSON-encoded array of [lat, lng] pairs — TfL order, latitude first),
// which we already fetch as part of the journey; no extra network calls. Walking legs carry a
// lineString too. When a leg has no usable lineString we fall back to a straight segment
// between its departure and arrival points.
//
// TfL's transit `lineString`s are stitched from per-segment track geometry and are sometimes
// malformed: a leg can trace forward to a point, then retrace the same track backwards as a
// dead-end "spur", before jumping to the real continuation (the District line through Tower Hill
// is the canonical example). We render the point list verbatim, so we'd faithfully draw that
// spur. `stripBacktracks` removes these out-and-back excursions before they reach the map — see
// below.

import type { Journey, Leg } from '@/features/journey/api/tfl'
import { legLineColor } from '@/features/journey/components/legDisplay'

export type LatLng = { latitude: number; longitude: number }

export type RouteLeg = { coords: LatLng[]; color: string; isWalking: boolean }

export type RouteMarker = { coord: LatLng; kind: 'start' | 'end' | 'interchange' }

export type RouteGeometry = {
  legs: RouteLeg[]
  markers: RouteMarker[]
  // Flattened coords across all legs, for camera fitting (fitToCoordinates).
  bounds: LatLng[]
}

/** Colours the caller supplies so this stays a pure, theme-agnostic helper. */
export type RouteColors = {
  // Fallback for a transit leg whose line has no known colour.
  fallback: string
  // Walking legs (rendered dashed by the map).
  walk: string
}

function isWalkingLeg(leg: Leg): boolean {
  return leg.mode.name === 'walking'
}

/** Parse a leg's `lineString` into map coords, or `null` if absent/malformed. */
function parseLineString(lineString: string | undefined): LatLng[] | null {
  if (!lineString) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(lineString)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const coords: LatLng[] = []
  for (const pair of parsed) {
    // TfL emits [lat, lng]; react-native-maps wants { latitude, longitude }.
    if (Array.isArray(pair) && typeof pair[0] === 'number' && typeof pair[1] === 'number') {
      coords.push({ latitude: pair[0], longitude: pair[1] })
    }
  }
  return coords.length >= 2 ? coords : null
}

/** A leg's endpoint as a coord, or `null` when TfL omits lat/lon (e.g. some raw addresses). */
function pointCoord(point: { lat?: number; lon?: number } | undefined): LatLng | null {
  if (point?.lat == null || point?.lon == null) return null
  return { latitude: point.lat, longitude: point.lon }
}

/** True when two coords are the same point to within ~1 m (i.e. a direct, walk-free interchange). */
function sameCoord(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.latitude - b.latitude) < 1e-5 && Math.abs(a.longitude - b.longitude) < 1e-5
}

// --- Backtrack removal ----------------------------------------------------------------------
//
// Distances here are small (a single tube/rail leg), so we project lat/lng onto a local flat
// plane in metres around a fixed London reference latitude rather than doing full haversine
// maths. Accuracy is well within the metre-scale tolerances we compare against.

const EARTH_R_M = 6_371_000
const REF_LAT_RAD = (51.5 * Math.PI) / 180
const COS_REF_LAT = Math.cos(REF_LAT_RAD)

type XY = { x: number; y: number }

function project({ latitude, longitude }: LatLng): XY {
  const rad = Math.PI / 180
  return { x: longitude * rad * COS_REF_LAT * EARTH_R_M, y: latitude * rad * EARTH_R_M }
}

/** Distance in metres from point `p` to the segment `a`→`b` (both already projected). */
function pointToSegmentM(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  // Degenerate segment (a == b): fall back to point distance.
  const t =
    lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq))
  const cx = a.x + t * dx
  const cy = a.y + t * dy
  return Math.hypot(p.x - cx, p.y - cy)
}

// A candidate point is dropped if it lands within REVISIT_EPS_M of geometry we've already drawn
// (an out-and-back spur retracing earlier track). We ignore the LOOKBACK_GAP most recent segments
// so ordinary forward motion — which always sits near the segment it extends — is never mistaken
// for a revisit; only doubling back onto *older* track triggers a drop. Tuned for the spacing of
// TfL's track vertices: large enough to catch a reversed arm sampled slightly off the forward arm,
// small enough to leave genuinely distinct track (e.g. the real continuation past a station) intact.
const REVISIT_EPS_M = 25
const LOOKBACK_GAP = 2
const DEDUPE_EPS_M = 5

/**
 * Remove out-and-back spurs and duplicate vertices from a TfL lineString. Keeps the first arm of
 * any fold (it lies on the real track) and skips points that retrace already-drawn geometry,
 * resuming once the path reaches genuinely new ground. Conservative by design: with too few points
 * to contain a fold, or if cleaning would collapse the path below two points, the input is returned
 * unchanged.
 */
function stripBacktracks(coords: LatLng[]): LatLng[] {
  if (coords.length < 4) return coords
  const projected = coords.map(project)
  const keptCoords: LatLng[] = [coords[0]]
  const keptXY: XY[] = [projected[0]]
  for (let i = 1; i < coords.length; i++) {
    const p = projected[i]
    const last = keptXY[keptXY.length - 1]
    // Drop near-identical consecutive points (TfL sometimes repeats a vertex verbatim).
    if (Math.hypot(p.x - last.x, p.y - last.y) < DEDUPE_EPS_M) continue
    // Does this point retrace an earlier segment (skipping the most recent ones)?
    let revisits = false
    for (let k = 0; k + 1 < keptXY.length - LOOKBACK_GAP; k++) {
      if (pointToSegmentM(p, keptXY[k], keptXY[k + 1]) < REVISIT_EPS_M) {
        revisits = true
        break
      }
    }
    if (revisits) continue
    keptCoords.push(coords[i])
    keptXY.push(p)
  }
  return keptCoords.length >= 2 ? keptCoords : coords
}

/** Geometry for one leg: its real path if available, else a straight departure→arrival line. */
function legCoords(leg: Leg): LatLng[] {
  const fromLineString = parseLineString(leg.path?.lineString)
  if (fromLineString) return fromLineString
  const start = pointCoord(leg.departurePoint)
  const end = pointCoord(leg.arrivalPoint)
  if (start && end) return [start, end]
  return []
}

export function journeyToRouteGeometry(journey: Journey, colors: RouteColors): RouteGeometry {
  const legs: RouteLeg[] = []
  const bounds: LatLng[] = []
  for (const leg of journey.legs) {
    const walking = isWalkingLeg(leg)
    // Only clean transit legs: TfL's malformed spurs are a track-geometry artifact, and street
    // walking paths legitimately double back (round a block, up-and-over) in ways the revisit
    // heuristic could wrongly collapse.
    const coords = walking ? legCoords(leg) : stripBacktracks(legCoords(leg))
    if (coords.length < 2) continue
    // Bridge any gap to the previous drawn leg with a straight dashed "walking" connector. TfL
    // sometimes omits the walking leg between two parts of a journey — e.g. a bus→tube changeover
    // where you alight at a stop and board at a separate station entrance — leaving the route as
    // two disconnected polylines. This stitches them so the path always reads as continuous.
    const prev = legs[legs.length - 1]
    if (prev) {
      const prevEnd = prev.coords[prev.coords.length - 1]
      const nextStart = coords[0]
      if (!sameCoord(prevEnd, nextStart)) {
        legs.push({ coords: [prevEnd, nextStart], color: colors.walk, isWalking: true })
      }
    }
    legs.push({
      coords,
      isWalking: walking,
      color: walking ? colors.walk : legLineColor(leg, colors.fallback),
    })
    bounds.push(...coords)
  }

  // A waypoint circle sits at the journey's true start and end plus every transit-leg endpoint.
  // All positions are taken from the rendered leg geometry (lineString coords) so markers land
  // exactly on the drawn polylines — using leg.departurePoint/arrivalPoint instead would place
  // markers at TfL metadata coordinates that can differ from where the lineString actually starts
  // and ends. Emitting both ends of every transit leg means that when two transit legs are joined
  // by a walking transfer both ends of that gap each get a circle. A direct interchange collapses
  // back to a single circle via the dedupe below; likewise the start/end collapse when the journey
  // begins or ends on a transit leg.
  const routeStart = legs[0]?.coords[0]
  const lastLeg = legs[legs.length - 1]
  const routeEnd = lastLeg?.coords[lastLeg.coords.length - 1]
  const endpoints: LatLng[] = []
  if (routeStart) endpoints.push(routeStart)
  for (const renderedLeg of legs) {
    if (!renderedLeg.isWalking) {
      endpoints.push(renderedLeg.coords[0])
      endpoints.push(renderedLeg.coords[renderedLeg.coords.length - 1])
    }
  }
  if (routeEnd) endpoints.push(routeEnd)
  // Collapse a point that coincides with the one before it (a same-station change with no walk).
  const deduped = endpoints.filter((p, i) => i === 0 || !sameCoord(p, endpoints[i - 1]))
  const markers: RouteMarker[] = deduped.map((coord, i) => ({
    coord,
    kind: i === 0 ? 'start' : i === deduped.length - 1 ? 'end' : 'interchange',
  }))

  return { legs, markers, bounds }
}
