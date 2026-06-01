// Cross-references TfL journeys against our own crowd-sourced live outage data. TfL plans
// step-free routes but doesn't know about the lift/escalator failures riders report to us,
// so we fetch our open failures (GET /failures) and flag any journey that passes through a
// station we currently know to be impaired. All of this runs on the client.

import { apiClient } from '@/api/client'
import type { Journey } from './tfl'

/** A station with one or more pieces of step-free equipment currently reported broken. */
export type StationOutage = { stationName: string; equipmentTypes: string[] }

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
 * Stations with at least one *open* (unresolved) equipment failure, grouped by station
 * with the distinct equipment types affected. Returns `[]` on any error (e.g. the backend
 * is unreachable) so journey results still render — accessibility flagging is additive.
 */
export async function fetchStationOutages(): Promise<StationOutage[]> {
  const { data, error } = await apiClient.GET('/failures')
  if (error || !data) return []

  const byStation = new Map<string, Set<string>>()
  for (const failure of data) {
    if (failure.resolved) continue
    const station = failure.equipment.station.name
    const types = byStation.get(station) ?? new Set<string>()
    types.add(failure.equipment.equipment_type.name)
    byStation.set(station, types)
  }

  return [...byStation].map(([stationName, types]) => ({
    stationName,
    equipmentTypes: [...types],
  }))
}

/** Every station name a journey touches, taken from each leg's departure/arrival points. */
function journeyStationNames(journey: Journey): string[] {
  const names: string[] = []
  for (const leg of journey.legs) {
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
  return outages.filter(outage => {
    const target = normaliseStationName(outage.stationName)
    return touched.some(name => name.includes(target) || target.includes(name))
  })
}
