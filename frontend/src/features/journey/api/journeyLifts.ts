// Works out which of a station's lifts are relevant to a rider who is *currently* on a journey
// that passes through it — used to surface those lifts first on the issue-reporting screen.
//
// The base signal is the *line* the rider is using at this station (TfL's journey legs carry no
// platform for tube). On top of that we try to narrow to the specific eastbound/westbound platform
// by deducing the direction of travel geometrically — see `legDirection`. The deduction is guarded:
// it is only applied when the deduced compass direction actually matches a platform label the
// station has on that line; otherwise we fall back to line-level (every platform on the line). The
// screen only reorders/highlights, never hides, so over-including on the fallback is safe.
//
// We also drop *branch* equipment: a lift that, besides touching the rider's platform, also reaches
// a platform of a service the rider isn't using (e.g. a tube↔National Rail interchange lift when
// the rider is exiting at their destination, not changing trains). See `isEquipmentOnJourney`.

import { normaliseStationName, platformEndpoints } from '@/features/journey/api/accessibility'
import type { Journey, Leg } from '@/features/journey/api/tfl'
import type { PlatformDetail } from '@/features/stations'

/** True if a TfL `commonName` refers to the same station as our terse `stationName`. */
function sameStation(commonName: string | undefined, normalisedTarget: string): boolean {
  if (!commonName) return false
  const n = normaliseStationName(commonName)
  return n.includes(normalisedTarget) || normalisedTarget.includes(n)
}

/** The compass direction a platform serves, parsed from its name ("Eastbound Platform 1" →
 *  "eastbound"). Null when the name carries no direction word (e.g. a terminus "Platform 1"). */
function platformDirection(name: string): string | null {
  const match = /\b(north|south|east|west)bound\b/i.exec(name)
  return match ? `${match[1].toLowerCase()}bound` : null
}

/**
 * The direction of travel on a leg, as a platform-style compass word ("eastbound" …), deduced from
 * the great-circle bearing between the leg's boarding and alighting points and snapped to the
 * nearest of N/E/S/W. Returns null when either endpoint lacks coordinates.
 *
 * This is a heuristic: it's correct where a line physically runs the way TfL labels it (most of the
 * network), but wrong where the label is a line-wide convention that contradicts local geometry
 * (e.g. the Jubilee line, labelled north/southbound but running roughly east–west through central
 * London). The caller guards against that by only trusting the result when it matches a real label.
 */
function legDirection(leg: Leg): string | null {
  const a = leg.departurePoint
  const b = leg.arrivalPoint
  if (a?.lat == null || a?.lon == null || b?.lat == null || b?.lon == null) return null

  const toRad = (deg: number) => (deg * Math.PI) / 180
  const p1 = toRad(a.lat)
  const p2 = toRad(b.lat)
  const dLon = toRad(b.lon - a.lon)
  const y = Math.sin(dLon) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon)
  const bearing = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360

  const compass: [string, number][] = [
    ['northbound', 0],
    ['eastbound', 90],
    ['southbound', 180],
    ['westbound', 270],
  ]
  let best = compass[0]
  let bestDelta = 360
  for (const entry of compass) {
    const delta = Math.min(Math.abs(bearing - entry[1]), 360 - Math.abs(bearing - entry[1]))
    if (delta < bestDelta) {
      bestDelta = delta
      best = entry
    }
  }
  return best[0]
}

/**
 * The platforms (normalised names) relevant to a rider at `stationName` on this journey, in two
 * granularities:
 *   - `onLine`   — every platform serving a line the journey uses here (union over touching legs).
 *   - `onJourney`— those narrowed to the leg's travel direction when it can be confidently matched
 *                  to a platform label here (see `legDirection`); line level otherwise.
 *
 * `onLine` is what lets us tell an *on-journey* platform apart from an off-journey one (a platform
 * of a service the rider isn't using). Both sets are empty if the journey never touches the station
 * or it has no platform on any line used here.
 */
export type JourneyPlatforms = { onJourney: Set<string>; onLine: Set<string> }

export function journeyPlatformsAtStation(
  journey: Journey,
  stationName: string,
  platforms: PlatformDetail[],
): JourneyPlatforms {
  const target = normaliseStationName(stationName)
  const onJourney = new Set<string>()
  const onLine = new Set<string>()

  for (const leg of journey.legs) {
    if (leg.mode.name === 'walking') continue
    if (
      !sameStation(leg.departurePoint?.commonName, target) &&
      !sameStation(leg.arrivalPoint?.commonName, target)
    )
      continue

    // The line(s) this leg uses. Lowercased so TfL's "District" lines up with our platform `lines`.
    const legLines = new Set<string>()
    for (const option of leg.routeOptions ?? []) {
      if (option.name) legLines.add(option.name.toLowerCase())
    }
    if (legLines.size === 0) continue

    const candidates = platforms.filter((p) => p.lines.some((l) => legLines.has(l.toLowerCase())))
    if (candidates.length === 0) continue

    for (const platform of candidates) onLine.add(normaliseStationName(platform.name))

    // Guarded narrowing: trust the deduced direction only if it matches a platform label here.
    const direction = legDirection(leg)
    const directional = direction
      ? candidates.filter((p) => platformDirection(p.name) === direction)
      : []
    const chosen = directional.length > 0 ? directional : candidates

    for (const platform of chosen) onJourney.add(normaliseStationName(platform.name))
  }

  return { onJourney, onLine }
}

/**
 * Whether a piece of equipment is on the rider's path through the station. It must connect one of
 * the rider's own platforms (`onJourney`) and must NOT also reach a platform of a service the rider
 * isn't using (any platform endpoint outside `onLine`). The second clause drops branch lifts — e.g.
 * a lift from your tube platform to the National Rail platforms when you're exiting, not changing.
 */
export function isEquipmentOnJourney(connection: string, relevant: JourneyPlatforms): boolean {
  const endpoints = platformEndpoints(connection).map(normaliseStationName)
  const touchesOwnPlatform = endpoints.some((e) => relevant.onJourney.has(e))
  if (!touchesOwnPlatform) return false
  const reachesOffJourneyPlatform = endpoints.some((e) => !relevant.onLine.has(e))
  return !reachesOffJourneyPlatform
}
