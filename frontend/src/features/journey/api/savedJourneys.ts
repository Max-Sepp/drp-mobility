// Persistence for journeys the rider chooses to keep (e.g. a regular commute).
// A saved journey is a *static snapshot* of the planned result — the exact legs, times and
// fare as planned, plus the from/to/preference it was planned with and the outage flags at
// save time.
//
// Storage strategy:
//   - Authenticated  → backend (GET/POST/DELETE /journeys, scoped to the current user)
//   - Unauthenticated → AsyncStorage on-device, same as before
//
// On first login/signup, any locally-stored journeys are uploaded to the backend and the
// local copy is cleared (see migrateLocalJourneys, called by AuthContext on sign-in).

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAuthToken } from '@/api/authToken'
import { apiClient } from '@/api/client'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { AccessibilityPreference, Journey } from '@/features/journey/api/tfl'

export const LOCAL_STORAGE_KEY = '@drp/saved-journeys'

export type SavedJourney = {
  id: string
  from?: ResolvedLocation
  to?: ResolvedLocation
  level: AccessibilityPreference | null
  outages: StationOutage[]
  journey: Journey
  savedAt: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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

async function readLocal(): Promise<SavedJourney[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedJourney[]) : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Public API  (signatures unchanged from the original AsyncStorage implementation)
// ---------------------------------------------------------------------------

/** Load every saved journey, newest first. */
export async function loadSavedJourneys(): Promise<SavedJourney[]> {
  if (!isAuthed()) return readLocal()
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
 * without reloading the full list.
 */
export async function saveJourney(
  input: Omit<SavedJourney, 'id' | 'savedAt'>,
): Promise<SavedJourney> {
  const record: SavedJourney = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  }

  if (!isAuthed()) {
    const existing = await readLocal()
    await AsyncStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([record, ...existing]))
    return record
  }

  await apiClient.POST('/journeys', {
    body: { id: record.id, saved_at: record.savedAt, payload: toPayload(record) },
  })
  return record
}

/** Remove a saved journey by id. */
export async function deleteJourney(id: string): Promise<void> {
  if (!isAuthed()) {
    const existing = await readLocal()
    await AsyncStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(existing.filter((j) => j.id !== id)),
    )
    return
  }
  await apiClient.DELETE('/journeys/{journey_id}', {
    params: { path: { journey_id: id } },
  })
}

/**
 * A stable signature for a planned journey used to detect whether a fresh result
 * is already saved (to avoid duplicate saves). Unchanged from the prior implementation.
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
