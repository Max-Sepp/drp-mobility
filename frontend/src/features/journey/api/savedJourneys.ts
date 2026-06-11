// Persistence for journeys the rider chooses to keep (e.g. a regular commute).
// A saved journey is a *static snapshot* of the planned result — the exact legs, times and
// fare as planned, plus the from/to/preference it was planned with and the outage flags at
// save time. Saved journeys are always stored on the backend and require authentication.

import { getAuthToken } from '@/api/authToken'
import { apiClient } from '@/api/client'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { AccessibilityPreference, Journey } from '@/features/journey/api/tfl'

export type SavedJourney = {
  id: string
  from?: ResolvedLocation
  to?: ResolvedLocation
  level: AccessibilityPreference | null
  outages: StationOutage[]
  journey: Journey
  savedAt: string
}

function isAuthed(): boolean {
  return getAuthToken() !== null
}

function toPayload(j: SavedJourney): string {
  return JSON.stringify(j)
}

function fromPayload(payload: string): SavedJourney | null {
  try {
    return JSON.parse(payload) as SavedJourney
  } catch {
    return null
  }
}

/** Load every saved journey, newest first. Returns empty when unauthenticated or on error. */
export async function loadSavedJourneys(): Promise<SavedJourney[]> {
  if (!isAuthed()) return []
  try {
    const { data } = await apiClient.GET('/journeys')
    if (!data) return []
    return data.flatMap((row) => {
      const j = fromPayload(row.payload)
      return j ? [j] : []
    })
  } catch {
    return []
  }
}

/**
 * Persist a new saved journey. Returns the stored record so callers can track it
 * without reloading the full list. No-op when unauthenticated.
 */
export async function saveJourney(
  input: Omit<SavedJourney, 'id' | 'savedAt'>,
): Promise<SavedJourney> {
  const record: SavedJourney = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  }

  if (!isAuthed()) return record

  await apiClient.POST('/journeys', {
    body: { id: record.id, saved_at: record.savedAt, payload: toPayload(record) },
  })
  return record
}

/** Remove a saved journey by id. No-op when unauthenticated. */
export async function deleteJourney(id: string): Promise<void> {
  if (!isAuthed()) return
  await apiClient.DELETE('/journeys/{journey_id}', {
    params: { path: { journey_id: id } },
  })
}

/**
 * A stable signature for a planned journey used to detect whether a fresh result
 * is already saved (to avoid duplicate saves).
 */
export function journeyKey(
  journey: Journey,
  from?: ResolvedLocation,
  to?: ResolvedLocation,
): string {
  return [
    from?.postcode ?? '',
    to?.postcode ?? '',
    journey.startDateTime,
    journey.arrivalDateTime,
    journey.duration,
  ].join('|')
}
