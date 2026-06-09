// Works out which of a station's lifts are relevant to a rider who is *currently* on a journey
// that passes through it — used to surface those lifts first on the issue-reporting screen.
//
// We can only match at line granularity, never to a single eastbound/westbound platform: TfL's
// journey legs carry no platform for tube (only the line + an Inbound/Outbound direction), so the
// strongest reliable signal is "the line the rider is using at this station". Every platform on
// that line is treated as relevant. This deliberately over-includes rather than guessing a
// direction we can't trust — the screen only reorders/highlights, never hides, so a broad match is
// safe.

import { normaliseStationName, platformEndpoints } from '@/features/journey/api/accessibility'
import type { Journey } from '@/features/journey/api/tfl'
import type { PlatformDetail } from '@/features/stations'

/** True if a TfL `commonName` refers to the same station as our terse `stationName`. */
function sameStation(commonName: string | undefined, normalisedTarget: string): boolean {
  if (!commonName) return false
  const n = normaliseStationName(commonName)
  return n.includes(normalisedTarget) || normalisedTarget.includes(n)
}

/**
 * The platform names (normalised) a rider uses at `stationName` on this journey: every platform
 * serving a line the journey boards or alights on here. Returns an empty set if the journey never
 * touches the station or the station has no platform on any line used here.
 */
export function journeyPlatformsAtStation(
  journey: Journey,
  stationName: string,
  platforms: PlatformDetail[],
): Set<string> {
  const target = normaliseStationName(stationName)

  // Lines the rider is on at this station, gathered from every transit leg that boards or alights
  // here. Lowercased so TfL's "District" lines up with our platform `lines` entries.
  const lines = new Set<string>()
  for (const leg of journey.legs) {
    if (leg.mode.name === 'walking') continue
    if (
      !sameStation(leg.departurePoint?.commonName, target) &&
      !sameStation(leg.arrivalPoint?.commonName, target)
    )
      continue
    for (const option of leg.routeOptions ?? []) {
      if (option.name) lines.add(option.name.toLowerCase())
    }
  }
  if (lines.size === 0) return new Set()

  const names = new Set<string>()
  for (const platform of platforms) {
    if (platform.lines.some((line) => lines.has(line.toLowerCase()))) {
      names.add(normaliseStationName(platform.name))
    }
  }
  return names
}

/**
 * Whether a piece of equipment connects to one of the journey-relevant platforms — i.e. a platform
 * endpoint in its connection string ("… → Westbound Platform 1") is in `relevantPlatforms` (a set
 * of normalised platform names from `journeyPlatformsAtStation`).
 */
export function isEquipmentOnJourney(connection: string, relevantPlatforms: Set<string>): boolean {
  return platformEndpoints(connection).some((endpoint) =>
    relevantPlatforms.has(normaliseStationName(endpoint)),
  )
}
