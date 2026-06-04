// On-device state for the single journey the rider is currently following ("executing"). Unlike
// a saved journey — a passive snapshot kept for later — the active journey tracks live progress:
// which leg the rider is on. It anchors to a SavedJourney via `savedId` (a journey is always
// saved before it is followed) but also embeds a full snapshot so the active screen keeps working
// even if the saved entry is deleted mid-trip. There is only ever one active journey, so it's
// stored as a single JSON object under one AsyncStorage key (not an array like saved journeys).

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { AccessibilityPreference, Journey } from '@/features/journey/api/tfl'

const STORAGE_KEY = '@drp/active-journey'

export type ActiveJourney = {
  // The SavedJourney this follow session is anchored to. Every active journey corresponds to a
  // persisted saved journey (the detail screen saves before starting).
  savedId: string
  // Self-contained snapshot so the active screen renders even if the saved entry is removed.
  journey: Journey
  from?: ResolvedLocation
  to?: ResolvedLocation
  outages: StationOutage[]
  level: AccessibilityPreference | null
  // 0-based index of the leg currently in progress.
  currentLegIndex: number
  // ISO timestamp the follow session began, for the resume banner ("Started 14:32").
  startedAt: string
}

/** Load the in-progress journey, or `null` if none is active or the stored data is corrupt. */
export async function loadActiveJourney(): Promise<ActiveJourney | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Guard against a stray array or partial write — only accept a record with a savedId.
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.savedId) {
      return parsed as ActiveJourney
    }
    return null
  } catch {
    return null
  }
}

/**
 * Begin following a journey. Starts at the first leg and stamps `startedAt`. Overwrites any
 * existing active journey — only one can be followed at a time. Returns the stored record.
 */
export async function startActiveJourney(
  input: Omit<ActiveJourney, 'currentLegIndex' | 'startedAt'>,
): Promise<ActiveJourney> {
  const record: ActiveJourney = {
    ...input,
    currentLegIndex: 0,
    startedAt: new Date().toISOString(),
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  return record
}

/**
 * Persist the rider's progress to a new leg. Clamps to the journey's leg range. No-op if there
 * is no active journey. Index/completion logic lives in the screen; this just stores the result.
 */
export async function setActiveLegIndex(index: number): Promise<void> {
  const active = await loadActiveJourney()
  if (!active) return
  const clamped = Math.max(0, Math.min(index, active.journey.legs.length - 1))
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...active, currentLegIndex: clamped }))
}

/** Clear the active journey — used both when it completes and when the rider ends it early. */
export async function clearActiveJourney(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY)
}
