// On-device persistence for journeys the rider chooses to keep (e.g. a regular commute).
// A saved journey is a *static snapshot* of the planned result — the exact legs, times and
// fare as planned, plus the from/to/preference it was planned with and the outage flags at
// save time. It is never re-planned; the snapshot's depart/arrive times will age, so we also
// store `savedAt` so the UI can show when it was captured. Everything is plain JSON, stored as
// a single array under one AsyncStorage key.

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { AccessibilityPreference, Journey } from '@/features/journey/api/tfl'

const STORAGE_KEY = '@drp/saved-journeys'

export type SavedJourney = {
  id: string
  // The resolved start/end the journey was planned between. Optional to mirror the journey
  // result type, where they may be absent.
  from?: ResolvedLocation
  to?: ResolvedLocation
  level: AccessibilityPreference | null
  // Outage flags captured when the journey was saved, so the snapshot stays self-contained.
  outages: StationOutage[]
  journey: Journey
  savedAt: string
}

/** Load every saved journey, newest first. Returns `[]` on missing or corrupt data. */
export async function loadSavedJourneys(): Promise<SavedJourney[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedJourney[]) : []
  } catch {
    return []
  }
}

/**
 * Persist a new saved journey, prepended so it appears at the top of the list. Returns the
 * stored record (with its generated id and savedAt) so callers can track it without reloading.
 */
export async function saveJourney(
  input: Omit<SavedJourney, 'id' | 'savedAt'>,
): Promise<SavedJourney> {
  const record: SavedJourney = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  }
  const existing = await loadSavedJourneys()
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([record, ...existing]))
  return record
}

/** Remove a saved journey by id. No-op if it isn't present. */
export async function deleteJourney(id: string): Promise<void> {
  const existing = await loadSavedJourneys()
  const next = existing.filter((j) => j.id !== id)
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

/**
 * A stable signature for a planned journey, so a *fresh* result (which has no id yet) can be
 * matched against the saved list to tell whether it's already saved and avoid duplicates.
 * Built from the endpoints' postcodes plus the journey's own start/arrival/duration, which
 * together uniquely identify one option among a plan's results.
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
