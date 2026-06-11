// Works out whether a station's broken equipment actually affects a given journey, rather than
// just flagging any station the journey touches. Two signals are combined, both from data we
// already hold (TfL legs + our /stations platform list), so this runs entirely on the client:
//
//   1. The rider's *role* at the station — do they board, alight, or change here? (Each implies
//      vertical movement between street/concourse and a platform.)
//   2. Which *platform* the broken unit serves vs which the journey uses — matched at line level
//      (platform names carry their lines), since TfL's leg direction is too loose to match a
//      specific platform reliably.

import type { StationDetail } from '@/features/stations'
import { normaliseStationName, resolveStationName } from '@/features/journey/api/accessibility'
import type { OutageUnit, StationOutage } from '@/features/journey/api/accessibility'
import type { Journey } from '@/features/journey/api/tfl'

/**
 * Extract every endpoint from a connection string — both sides of the →, including comma-
 * separated multi-platform ends. E.g. "Lift A: Entrance → Elizabeth line ticket hall" gives
 * ["Entrance", "Elizabeth line ticket hall"]. Used to find served lines even when the connection
 * doesn't mention the word "platform".
 */
function allLiftEndpoints(connection: string): string[] {
  const afterName = connection.includes(':')
    ? connection.slice(connection.indexOf(':') + 1)
    : connection
  return afterName
    .split('→')
    .flatMap((part) => part.split(','))
    .map((p) => p.trim())
    .filter(Boolean)
}

// Train modes whose legs board/alight at a station we can reason about. Mirrors the set used to
// make stations tappable; walking/bus/etc. don't put the rider on a platform.
const STATION_MODES = new Set([
  'tube',
  'dlr',
  'overground',
  'national-rail',
  'elizabeth-line',
  'tflrail',
])

/** How the rider uses a station on this journey. */
export type StationRole = 'board' | 'alight' | 'interchange' | 'unknown'

/**
 * Per-unit verdict:
 * - `on-your-platform` — serves a platform on a line the journey uses here.
 * - `shared-route` — a street/concourse/footbridge connector (no specific platform), so it's on
 *   the common vertical path the rider must use here.
 * - `other-platform` — serves a specific platform the journey doesn't use; may not affect you.
 * - `unknown` — couldn't determine (no line/platform data to compare).
 */
export type UnitVerdict = 'on-your-platform' | 'shared-route' | 'other-platform' | 'unknown'

export type AssessedUnit = OutageUnit & { verdict: UnitVerdict }

export type OutageAssessment = {
  stationName: string
  role: StationRole
  /** The lines the journey runs on through this station, for display ("your Victoria service"). */
  journeyLines: string[]
  units: AssessedUnit[]
  /**
   * How many lifts on this journey's specific path are broken, and how many exist in total on
   * that path. "On your path" means verdict on-your-platform or shared-route.
   */
  journeyRelevantLifts: { broken: number; total: number }
}

/**
 * Verdicts that *directly affect* the journey — equipment on a platform/line the rider uses here,
 * or on the shared vertical path they must take. Other verdicts (`other-platform`, `unknown`) are
 * only *potentially* relevant and are tucked away from the at-a-glance view.
 */
export const DIRECT_VERDICTS = new Set<UnitVerdict>(['on-your-platform', 'shared-route'])

/** A TfL service disruption affecting a line the journey runs on. */
export type RouteDisruption = { line: string; description: string }

/**
 * The TfL service disruptions attached to a journey's legs, deduped on line + description. These
 * sit on a line the rider is actually on, so they always directly affect the journey.
 */
export function collectDisruptions(journey: Journey): RouteDisruption[] {
  const out: RouteDisruption[] = []
  const seen = new Set<string>()
  for (const leg of journey.legs) {
    if (!leg.isDisrupted || !leg.disruptions) continue
    const line = legLine(leg)
    for (const disruption of leg.disruptions) {
      const description = disruption.description?.trim()
      if (!description) continue
      const key = `${line}|${description}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ line, description })
    }
  }
  return out
}

/** The line a train leg runs on: TfL's route name, else the mode (e.g. "DLR"). */
function legLine(leg: Journey['legs'][number]): string {
  return leg.routeOptions?.[0]?.name?.trim() || leg.mode.name
}

function linesOverlap(a: string[], b: string[]): boolean {
  const normalised = b.map((x) => normaliseStationName(x))
  return a.some((x) => {
    const n = normaliseStationName(x)
    return normalised.some((m) => m.includes(n) || n.includes(m))
  })
}

/**
 * The rider's role at `stationName` and the lines they use there, derived from the train legs
 * that depart from or arrive at it.
 */
function roleAt(
  journey: Journey,
  stationName: string,
  stationNames: string[],
): { role: StationRole; lines: string[] } {
  let departs = false
  let arrives = false
  const lines: string[] = []
  for (const leg of journey.legs) {
    if (!STATION_MODES.has(leg.mode.name)) continue
    const dep = leg.departurePoint?.commonName
    const arr = leg.arrivalPoint?.commonName
    const departsHere = !!dep && resolveStationName(dep, stationNames) === stationName
    const arrivesHere = !!arr && resolveStationName(arr, stationNames) === stationName
    if (departsHere || arrivesHere) lines.push(legLine(leg))
    departs = departs || departsHere
    arrives = arrives || arrivesHere
  }
  const role: StationRole =
    departs && arrives ? 'interchange' : departs ? 'board' : arrives ? 'alight' : 'unknown'
  return { role, lines: [...new Set(lines)] }
}

/**
 * The lines served by a connection endpoint, looked up on the station. Tries two strategies:
 * 1. Platform name match — "Westbound Platform 1" → District, Circle.
 * 2. Line name in text — "Elizabeth line ticket hall" contains "Elizabeth" → Elizabeth.
 * Both use normalised containment so "elizabeth line ticket hall".includes("elizabeth") matches.
 */
function servedLines(station: StationDetail | undefined, endpoint: string): string[] {
  if (!station) return []
  const target = normaliseStationName(endpoint)

  // Strategy 1: match against platform names
  const byPlatformName = station.platforms
    .filter((p) => {
      const n = normaliseStationName(p.name)
      return n.includes(target) || target.includes(n)
    })
    .flatMap((p) => p.lines)
  if (byPlatformName.length > 0) return byPlatformName

  // Strategy 2: the endpoint text mentions a line name (e.g. "Elizabeth line ticket hall")
  return station.platforms
    .filter((p) =>
      p.lines.some((line) => {
        const l = normaliseStationName(line)
        return target.includes(l) || l.includes(target)
      }),
    )
    .flatMap((p) => p.lines)
}

function verdictFor(
  unit: OutageUnit,
  station: StationDetail | undefined,
  journeyLines: string[],
): UnitVerdict {
  // First pass: use the pre-computed platform-keyword endpoints (most precise).
  if (unit.platformEndpoints.length > 0) {
    const lines = unit.platformEndpoints.flatMap((p) => servedLines(station, p))
    if (lines.length > 0 && journeyLines.length > 0) {
      return linesOverlap(lines, journeyLines) ? 'on-your-platform' : 'other-platform'
    }
  }
  // Second pass: extract all endpoints (both sides of →) and try line-name matching.
  // This catches connections like "Lift 6: Entrance tunnel → Elizabeth line ticket hall" where
  // neither side contains "platform" but one side names a line.
  const allLines = allLiftEndpoints(unit.connection).flatMap((p) => servedLines(station, p))
  if (allLines.length === 0) return 'shared-route' // generic connector (booking hall, street)
  if (journeyLines.length === 0) return 'unknown'
  return linesOverlap(allLines, journeyLines) ? 'on-your-platform' : 'other-platform'
}

/**
 * Count all lifts at a station that are on the user's journey path: shared-route connectors
 * (no platform endpoint — everyone uses them) plus platform-specific lifts whose platform
 * serves a line the journey uses. Lifts with platform endpoints that we can't match to any line
 * (unknown) are excluded (strict mode).
 */
function journeyRelevantLiftCount(
  station: StationDetail | undefined,
  journeyLines: string[],
): number {
  if (!station?.lifts) return 0
  let count = 0
  for (const lift of station.lifts) {
    const lines = allLiftEndpoints(lift.connection).flatMap((p) => servedLines(station, p))
    if (lines.length === 0) {
      // No lines found in any endpoint → generic connector (booking hall ↔ street etc.)
      // Everyone must use it, so always count it.
      count++
    } else if (journeyLines.length > 0 && linesOverlap(lines, journeyLines)) {
      count++
    }
    // else: serves a specific line the journey doesn't use → don't count
  }
  return count
}

/**
 * Assess every flagged station on the journey, turning each broken unit into a verdict on whether
 * it's actually on the rider's route. `stations` is our full station list (for platform lines).
 */
export function assessOutages(
  journey: Journey,
  outages: StationOutage[],
  stations: StationDetail[],
): OutageAssessment[] {
  const stationNames = stations.map((s) => s.name)
  const assessed: OutageAssessment[] = []
  for (const outage of outages) {
    const { role, lines } = roleAt(journey, outage.stationName, stationNames)
    // Skip stations no train leg boards/alights at — the journey only touches them via bus/coach
    // (e.g. a bus-to-bus interchange at a stop that shares a train station's name), so the rider
    // never uses that station's lifts/escalators.
    if (role === 'unknown') continue
    const station = stations.find(
      (s) => normaliseStationName(s.name) === normaliseStationName(outage.stationName),
    )
    const assessedUnits = outage.units.map((unit) => ({
      ...unit,
      verdict: verdictFor(unit, station, lines),
    }))
    const journeyBroken = assessedUnits.filter(
      (u) =>
        u.equipmentType === 'lift' &&
        (u.verdict === 'on-your-platform' || u.verdict === 'shared-route'),
    ).length
    const journeyTotal = journeyRelevantLiftCount(station, lines)
    assessed.push({
      stationName: outage.stationName,
      role,
      journeyLines: lines,
      units: assessedUnits,
      journeyRelevantLifts: { broken: journeyBroken, total: journeyTotal },
    })
  }
  return assessed
}
