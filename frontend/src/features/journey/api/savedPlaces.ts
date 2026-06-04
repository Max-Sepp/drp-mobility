// On-device persistence for the user's named places (Home, Work, custom).
// Stored per user ID so switching accounts doesn't cross-contaminate.

import AsyncStorage from '@react-native-async-storage/async-storage'

const key = (userId: number) => `@drp/saved-places/${userId}`

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

export async function loadSavedPlaces(userId: number): Promise<SavedPlaces> {
  try {
    const raw = await AsyncStorage.getItem(key(userId))
    if (!raw) return { custom: [] }
    const parsed = JSON.parse(raw)
    return { custom: [], ...parsed }
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
  await AsyncStorage.setItem(key(userId), JSON.stringify({ ...current, [placeKey]: place }))
}

export async function clearPlace(userId: number, placeKey: 'home' | 'work'): Promise<void> {
  const current = await loadSavedPlaces(userId)
  const { [placeKey]: _removed, ...rest } = current
  await AsyncStorage.setItem(key(userId), JSON.stringify(rest))
}

export async function addCustomPlace(
  userId: number,
  place: Omit<CustomPlace, 'id'>,
): Promise<CustomPlace> {
  const current = await loadSavedPlaces(userId)
  const newPlace: CustomPlace = { ...place, id: String(Date.now()) }
  await AsyncStorage.setItem(
    key(userId),
    JSON.stringify({ ...current, custom: [...current.custom, newPlace] }),
  )
  return newPlace
}

export async function removeCustomPlace(userId: number, id: string): Promise<void> {
  const current = await loadSavedPlaces(userId)
  await AsyncStorage.setItem(
    key(userId),
    JSON.stringify({ ...current, custom: current.custom.filter((p) => p.id !== id) }),
  )
}
