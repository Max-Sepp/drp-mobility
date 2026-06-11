import AsyncStorage from '@react-native-async-storage/async-storage'
import { getAuthToken } from '@/api/authToken'
import { apiClient } from '@/api/client'

const LOCAL_KEY = '@drp/recent-locations'
const MAX_LOCAL = 10

export type RecentLocation = {
  label: string
  postcode: string | null
  searched_at: string
}

function isAuthed(): boolean {
  return getAuthToken() !== null
}

async function readLocal(): Promise<RecentLocation[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as RecentLocation[]) : []
  } catch {
    return []
  }
}

async function writeLocal(entries: RecentLocation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(entries))
  } catch {
    // Storage write failure is non-fatal for recents
  }
}

export async function getRecentLocations(): Promise<RecentLocation[]> {
  if (!isAuthed()) return readLocal()
  try {
    const { data } = await apiClient.GET('/users/me/recent-locations')
    if (!data) return []
    return data.map((r) => ({
      label: r.label,
      postcode: r.postcode ?? null,
      searched_at: r.searched_at,
    }))
  } catch {
    return []
  }
}

export async function addRecentLocation(label: string, postcode: string | null): Promise<void> {
  if (!isAuthed()) {
    const existing = await readLocal()
    const filtered = existing.filter((r) => r.label !== label)
    const updated = [{ label, postcode, searched_at: new Date().toISOString() }, ...filtered].slice(
      0,
      MAX_LOCAL,
    )
    await writeLocal(updated)
    return
  }
  try {
    await apiClient.POST('/users/me/recent-locations', {
      body: { label, postcode: postcode ?? undefined },
    })
  } catch {
    // Fire-and-forget; network failure is non-fatal
  }
}
