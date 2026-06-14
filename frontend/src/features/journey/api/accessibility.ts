// Cross-references TfL journeys against our own crowd-sourced live outage data. TfL plans
// step-free routes but doesn't know about the lift/escalator failures riders report to us,
// so we fetch our open failures (GET /failures) and flag any journey that passes through a
// station we currently know to be impaired. All of this runs on the client.

import { apiClient } from '@/api/client'
import type { Journey } from '@/features/journey/api/tfl'
import type { OutageReport } from '@/features/outages/types'

/** One specific broken piece of equipment at a station, with its reported detail. */
export type OutageUnit = {
  /** The failure (outage incident) this unit belongs to — used to fetch its event timeline. */
  failureId: number
  /** "lift" or "escalator". */
  equipmentType: string
  /** The full connection description, e.g. "Lift A: Booking Hall → Railway platform 1". */
  connection: string
  /** Platform endpoints named in the connection, e.g. ["Railway platform 1"]. May be empty
   *  for connectors between non-platform areas (street ↔ booking hall, footbridge, …). */
  platformEndpoints: string[]
  reportCount: number
  lastReported: string | null
  /** Whether a trusted worker has confirmed this outage on-site, and how many times. */
  verified: boolean
  verificationCount: number
  /** Escalator topology is not published by TfL, so escalator connections are estimates. */
  estimated: boolean
}

/** A station with one or more pieces of step-free equipment currently reported broken. */
export type StationOutage = {
  stationName: string
  equipmentTypes: string[]
  units: OutageUnit[]
  /** For each equipment type, the total count installed at this station (broken + working). */
  totalByType: Record<string, number>
  /**
   * Journey-relevant lift counts: how many lifts on the user's specific path are broken vs.
   * total. Populated by enrichOutagesWithJourneyRelevance() in JourneyPlannerSheet after
   * assessOutages runs; absent until then.
   */
  journeyRelevantLifts?: { broken: number; total: number }
}

/**
 * Pull the area names out of a connection string. "Lift A: Booking Hall → Railway platform 1"
 * becomes ["Booking Hall", "Railway platform 1"].
 */
function connectionEndpoints(connection: string): string[] {
  const afterName = connection.includes(':')
    ? connection.slice(connection.indexOf(':') + 1)
    : connection
  return afterName
    .split('→')
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * The platform(s) a connection touches. Endpoints that name a platform are kept (and any
 * comma-joined list, e.g. "Northbound Platform 1, Southbound Platform 2", is split out).
 */
export function platformEndpoints(connection: string): string[] {
  return connectionEndpoints(connection)
    .filter((endpoint) => /platform/i.test(endpoint))
    .flatMap((endpoint) => endpoint.split(',').map((p) => p.trim()))
    .filter(Boolean)
}

// Suffixes TfL appends to station names that our own names (e.g. "Victoria") omit.
const STATION_SUFFIX_RE = /\s+(?:underground|rail|dlr|bus)?\s*station$/

/**
 * Reduce a station name to a comparable core so TfL's verbose `commonName`
 * ("King's Cross St. Pancras Underground Station") and our terse name ("King's Cross")
 * match: lower-case, drop apostrophes/periods, strip a trailing "… Station" suffix, and
 * collapse whitespace.
 */
export function normaliseStationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(STATION_SUFFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolve a TfL `commonName` ("Victoria Underground Station") to the matching name in our own
 * station list ("Victoria"), or null if we don't have that station. Matches on normalised
 * containment so the verbose TfL form lines up with our terse names. Used to make the stations
 * in a planned journey link through to their station-detail screen.
 */
export function resolveStationName(commonName: string, knownNames: string[]): string | null {
  const target = normaliseStationName(commonName)
  // Prefer an exact normalised match before falling back to containment, so e.g. "Victoria"
  // doesn't accidentally win over "Victoria Coach" when both are present.
  const exact = knownNames.find((name) => normaliseStationName(name) === target)
  if (exact) return exact
  const partial = knownNames.find((name) => {
    const n = normaliseStationName(name)
    return n.includes(target) || target.includes(n)
  })
  return partial ?? null
}

/**
 * Stations with at least one *open* (unresolved) equipment failure, grouped by station
 * with the distinct equipment types affected. Returns `[]` on any error (e.g. the backend
 * is unreachable) so journey results still render — accessibility flagging is additive.
 */
export async function fetchStationOutages(): Promise<StationOutage[]> {
  // openapi-fetch turns non-2xx *responses* into `{ error }`, but a raw network failure (the
  // backend unreachable) makes the call *throw* — catch it here so a backend outage never aborts
  // the journey search, which only awaits this for additive accessibility flagging.
  let data, error
  try {
    ;({ data, error } = await apiClient.GET('/failures'))
  } catch {
    return []
  }
  if (error || !data) return []

  const byStation = new Map<string, OutageUnit[]>()
  const totalByStationType = new Map<string, Record<string, number>>()
  for (const failure of data) {
    if (failure.resolved) continue
    const { equipment } = failure
    const station = equipment.station.name
    const type = equipment.equipment_type.name
    const units = byStation.get(station) ?? []
    units.push({
      failureId: failure.id,
      equipmentType: type,
      connection: equipment.connection,
      platformEndpoints: platformEndpoints(equipment.connection),
      reportCount: failure.report_count,
      lastReported: failure.last_reported,
      verified: failure.verified,
      verificationCount: failure.verifications.length,
      estimated: type === 'escalator',
    })
    byStation.set(station, units)
    const totals = totalByStationType.get(station) ?? {}
    totals[type] = failure.station_total_same_type_count
    totalByStationType.set(station, totals)
  }

  return [...byStation].map(([stationName, units]) => ({
    stationName,
    equipmentTypes: [...new Set(units.map((u) => u.equipmentType))],
    units,
    totalByType: totalByStationType.get(stationName) ?? {},
  }))
}

/**
 * Convert the live SSE `OutageReport[]` feed (from `useOutages`) into the `StationOutage[]`
 * format expected by `matchOutages` and `assessOutages`. One `OutageUnit` is produced per
 * unique failure (grouped by `failure_id`); `reportCount` and `lastReported` are derived from
 * the individual reports in the feed.
 */
export function reportsToStationOutages(reports: OutageReport[]): StationOutage[] {
  const unitsByFailure = new Map<number, OutageUnit>()

  for (const report of reports) {
    if (report.failure.resolved) continue
    const { failure_id, failure, breakdown_time } = report
    const existing = unitsByFailure.get(failure_id)
    if (existing) {
      existing.reportCount++
      if (breakdown_time > (existing.lastReported ?? '')) existing.lastReported = breakdown_time
    } else {
      unitsByFailure.set(failure_id, {
        failureId: failure_id,
        equipmentType: failure.equipment.equipment_type.name,
        connection: failure.equipment.connection,
        platformEndpoints: platformEndpoints(failure.equipment.connection),
        reportCount: 1,
        lastReported: breakdown_time,
        verified: failure.verified,
        verificationCount: failure.verifications.length,
        estimated: failure.equipment.equipment_type.name === 'escalator',
      })
    }
  }

  const byStation = new Map<string, OutageUnit[]>()
  for (const [failureId, unit] of unitsByFailure) {
    const stationName = reports.find((r) => r.failure_id === failureId)!.failure.equipment.station
      .name
    const arr = byStation.get(stationName) ?? []
    arr.push(unit)
    byStation.set(stationName, arr)
  }

  return [...byStation].map(([stationName, units]) => {
    const totalByType: Record<string, number> = {}
    for (const u of units) totalByType[u.equipmentType] = (totalByType[u.equipmentType] ?? 0) + 1
    return {
      stationName,
      equipmentTypes: [...new Set(units.map((u) => u.equipmentType))],
      units,
      totalByType,
    }
  })
}

// Train modes whose stations the rider actually enters (and whose lifts/escalators matter). A
// station touched only by bus/coach/walking legs — e.g. a bus-to-bus interchange at a stop that
// shares a train station's name — is excluded, since the rider never uses that station's equipment.
const STATION_MODES = new Set([
  'tube',
  'dlr',
  'overground',
  'national-rail',
  'elizabeth-line',
  'tflrail',
])

/** Every train station a journey stops at, taken from each train leg's departure/arrival points. */
function journeyStationNames(journey: Journey): string[] {
  const names: string[] = []
  for (const leg of journey.legs) {
    if (!STATION_MODES.has(leg.mode.name)) continue
    if (leg.departurePoint?.commonName) names.push(leg.departurePoint.commonName)
    if (leg.arrivalPoint?.commonName) names.push(leg.arrivalPoint.commonName)
  }
  return names
}

/**
 * The outages affecting a given journey: those whose station name matches (by normalised
 * containment) a station the journey passes through.
 */
export function matchOutages(journey: Journey, outages: StationOutage[]): StationOutage[] {
  const touched = journeyStationNames(journey).map(normaliseStationName)
  return outages.filter((outage) => {
    const target = normaliseStationName(outage.stationName)
    return touched.some((name) => name.includes(target) || target.includes(name))
  })
}
