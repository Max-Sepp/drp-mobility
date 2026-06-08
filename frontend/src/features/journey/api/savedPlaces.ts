// Server-side persistence for the user's named places (Home, Work, custom).
// All reads and writes go to the backend (GET/PUT /users/me/saved-places) using the
// current session token — the server enforces that only the account holder can access
// their own data.
//
// Migration: on first load after this version ships, any data previously stored in
// AsyncStorage under the legacy key is uploaded to the backend then cleared locally.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { BASE_URL } from '@/api/client'
import { getAuthToken } from '@/api/authToken'

const LEGACY_KEY = (userId: number) => `@drp/saved-places/${userId}`
const MIGRATED_KEY = (userId: number) => `@drp/saved-places-migrated/${userId}`

export type SavedPlace = {
  address: string
  postcode: string
}

export type CustomPlace = {
  id: string
  name: string
  icon: string
  address: string
  postcode: string
}

export type SavedPlaces = {
  home?: SavedPlace
  work?: SavedPlace
  custom: CustomPlace[]
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function apiGet(): Promise<SavedPlaces> {
  const token = getAuthToken()
  const res = await fetch(`${BASE_URL}/users/me/saved-places`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as SavedPlaces
}

async function apiPut(places: SavedPlaces): Promise<void> {
  const token = getAuthToken()
  const res = await fetch(`${BASE_URL}/users/me/saved-places`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(places),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// One-time migration: upload any locally-stored places, then clear the local copy.
async function migrateIfNeeded(userId: number): Promise<void> {
  try {
    if (await AsyncStorage.getItem(MIGRATED_KEY(userId))) return
    const raw = await AsyncStorage.getItem(LEGACY_KEY(userId))
    if (raw) {
      const parsed: SavedPlaces = { custom: [], ...JSON.parse(raw) }
      await apiPut(parsed)
      await AsyncStorage.removeItem(LEGACY_KEY(userId))
    }
    await AsyncStorage.setItem(MIGRATED_KEY(userId), '1')
  } catch {
    // Migration failed; will retry on next load rather than blocking the app.
  }
}

// ---------------------------------------------------------------------------
// Public API  (signatures unchanged from the AsyncStorage implementation so
// call sites need no changes)
// ---------------------------------------------------------------------------

export async function loadSavedPlaces(userId: number): Promise<SavedPlaces> {
  try {
    await migrateIfNeeded(userId)
    return await apiGet()
  } catch {
    return { custom: [] }
  }
}

export async function savePlace(
  userId: number,
  placeKey: 'home' | 'work',
  place: SavedPlace,
): Promise<void> {
  const current = await loadSavedPlaces(userId)
  await apiPut({ ...current, [placeKey]: place })
}

export async function clearPlace(userId: number, placeKey: 'home' | 'work'): Promise<void> {
  const current = await loadSavedPlaces(userId)
  const { [placeKey]: _removed, ...rest } = current
  await apiPut(rest as SavedPlaces)
}

export async function addCustomPlace(
  userId: number,
  place: Omit<CustomPlace, 'id'>,
): Promise<CustomPlace> {
  const current = await loadSavedPlaces(userId)
  const newPlace: CustomPlace = { ...place, id: String(Date.now()) }
  await apiPut({ ...current, custom: [...current.custom, newPlace] })
  return newPlace
}

export async function removeCustomPlace(userId: number, id: string): Promise<void> {
  const current = await loadSavedPlaces(userId)
  await apiPut({ ...current, custom: current.custom.filter((p) => p.id !== id) })
}
