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
import {
  normaliseStationName,
  resolveStationName,
} from '@/features/journey/api/accessibility'
import type { OutageUnit, StationOutage } from '@/features/journey/api/accessibility'
import type { Journey } from '@/features/journey/api/tfl'

/** Extract platform-like endpoints from a connection string (mirrors platformEndpoints in accessibility.ts). */
function liftPlatformEndpoints(connection: string): string[] {
  const afterName = connection.includes(':') ? connection.slice(connection.indexOf(':') + 1) : connection
  return afterName
    .split('→')
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => /platform/i.test(p))
    .flatMap((p) => p.split(',').map((x) => x.trim()))
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

/** The lines served by the platform(s) a connection endpoint names, looked up on the station. */
function servedLines(station: StationDetail | undefined, platformName: string): string[] {
  if (!station) return []
  const target = normaliseStationName(platformName)
  return station.platforms
    .filter((p) => {
      const n = normaliseStationName(p.name)
      return n.includes(target) || target.includes(n)
    })
    .flatMap((p) => p.lines)
}

function verdictFor(
  unit: OutageUnit,
  station: StationDetail | undefined,
  journeyLines: string[],
): UnitVerdict {
  if (unit.platformEndpoints.length === 0) return 'shared-route'
  const lines = unit.platformEndpoints.flatMap((p) => servedLines(station, p))
  if (lines.length === 0) return 'unknown'
  if (journeyLines.length === 0) return 'unknown'
  return linesOverlap(lines, journeyLines) ? 'on-your-platform' : 'other-platform'
}

/**
 * Count all lifts at a station that are on the user's journey path: shared-route connectors
 * (no platform endpoint — everyone uses them) plus platform-specific lifts whose platform
 * serves a line the journey uses. Lifts with platform endpoints that we can't match to any line
 * (unknown) are excluded (strict mode).
 */
function journeyRelevantLiftCount(station: StationDetail | undefined, journeyLines: string[]): number {
  if (!station?.lifts) return 0
  let count = 0
  for (const lift of station.lifts) {
    const endpoints = liftPlatformEndpoints(lift.connection)
    if (endpoints.length === 0) {
      // shared-route: street ↔ booking hall etc. — always on the path
      count++
      continue
    }
    const lines = endpoints.flatMap((p) => servedLines(station, p))
    if (lines.length === 0) continue // unknown — exclude (strict)
    if (journeyLines.length > 0 && linesOverlap(lines, journeyLines)) count++
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
  return outages.map((outage) => {
    const { role, lines } = roleAt(journey, outage.stationName, stationNames)
    const station = stations.find(
      (s) => normaliseStationName(s.name) === normaliseStationName(outage.stationName),
    )
    const assessedUnits = outage.units.map((unit) => ({
      ...unit,
      verdict: verdictFor(unit, station, lines),
    }))
    const journeyBroken = assessedUnits.filter(
      (u) => u.equipmentType === 'lift' && (u.verdict === 'on-your-platform' || u.verdict === 'shared-route'),
    ).length
    const journeyTotal = journeyRelevantLiftCount(station, lines)
    return {
      stationName: outage.stationName,
      role,
      journeyLines: lines,
      units: assessedUnits,
      journeyRelevantLifts: { broken: journeyBroken, total: journeyTotal },
    }
  })
}
