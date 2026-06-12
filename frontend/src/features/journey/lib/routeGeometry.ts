// Turns a TfL `Journey` into renderable map geometry: a coloured polyline per leg plus
// board / alight / interchange marker points. The geometry comes from each leg's
// `path.lineString` (a JSON-encoded array of [lat, lng] pairs — TfL order, latitude first),
// which we already fetch as part of the journey; no extra network calls. Walking legs carry a
// lineString too. When a leg has no usable lineString we fall back to a straight segment
// between its departure and arrival points.

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
    const coords = legCoords(leg)
    if (coords.length < 2) continue
    const walking = isWalkingLeg(leg)
    legs.push({
      coords,
      isWalking: walking,
      color: walking ? colors.walk : legLineColor(leg, colors.fallback),
    })
    bounds.push(...coords)
  }

  // Markers sit at the transit legs' endpoints: start of the first transit leg, end of the last,
  // and the shared point between each pair of consecutive transit legs (the interchanges).
  const transitLegs = journey.legs.filter((leg) => !isWalkingLeg(leg))
  const markers: RouteMarker[] = []
  if (transitLegs.length > 0) {
    const startCoord = pointCoord(transitLegs[0].departurePoint)
    if (startCoord) markers.push({ coord: startCoord, kind: 'start' })
    for (let i = 1; i < transitLegs.length; i++) {
      const coord = pointCoord(transitLegs[i].departurePoint)
      if (coord) markers.push({ coord, kind: 'interchange' })
    }
    const endCoord = pointCoord(transitLegs[transitLegs.length - 1].arrivalPoint)
    if (endCoord) markers.push({ coord: endCoord, kind: 'end' })
  }

  return { legs, markers, bounds }
}
