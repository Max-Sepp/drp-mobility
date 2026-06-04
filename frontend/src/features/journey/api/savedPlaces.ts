// On-device persistence for the user's named places (Home, Work).
// Stored per user ID so switching accounts doesn't cross-contaminate.

import AsyncStorage from '@react-native-async-storage/async-storage'

const key = (userId: number) => `@drp/saved-places/${userId}`

export type SavedPlace = {
  address: string
  postcode: string
}

export type SavedPlaces = {
  home?: SavedPlace
  work?: SavedPlace
}

export async function loadSavedPlaces(userId: number): Promise<SavedPlaces> {
  try {
    const raw = await AsyncStorage.getItem(key(userId))
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export async function savePlace(
  userId: number,
  placeKey: 'home' | 'work',
  place: SavedPlace,
): Promise<void> {
  const current = await loadSavedPlaces(userId)
  await AsyncStorage.setItem(key(userId), JSON.stringify({ ...current, [placeKey]: place }))
}

export async function clearPlace(userId: number, placeKey: 'home' | 'work'): Promise<void> {
  const current = await loadSavedPlaces(userId)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { [placeKey]: _removed, ...rest } = current
  await AsyncStorage.setItem(key(userId), JSON.stringify(rest))
}
