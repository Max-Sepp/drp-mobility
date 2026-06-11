import { getAuthToken } from '@/api/authToken'
import { apiClient } from '@/api/client'

export type RecentLocation = {
  label: string
  postcode: string | null
  searched_at: string
}

function isAuthed(): boolean {
  return getAuthToken() !== null
}

/** Returns the user's recent search locations. Empty when unauthenticated or on error. */
export async function getRecentLocations(): Promise<RecentLocation[]> {
  if (!isAuthed()) return []
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

/** Records a location search. No-op when unauthenticated; network failure is non-fatal. */
export async function addRecentLocation(label: string, postcode: string | null): Promise<void> {
  if (!isAuthed()) return
  try {
    await apiClient.POST('/users/me/recent-locations', {
      body: { label, postcode: postcode ?? undefined },
    })
  } catch {
    // Fire-and-forget
  }
}
