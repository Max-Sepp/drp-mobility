// On-device cache of the outage feed, so the most recent reports are shown instantly on launch —
// before the SSE stream connects and sends its fresh snapshot. Plain JSON under one AsyncStorage
// key, mirroring the journey storage in src/features/journey/api/savedJourneys.ts.

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { OutageReport } from '@/features/outages/types'

const STORAGE_KEY = '@drp/outage-reports'
const VIEWED_KEY = '@drp/outage-viewed'

/** Map of failure_id → ISO timestamp the user last viewed that outage. */
export type ViewedMap = Record<number, string>

/** Load the cached feed. Returns `[]` on missing or corrupt data. */
export async function loadOutages(): Promise<OutageReport[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as OutageReport[]) : []
  } catch {
    return []
  }
}

/** Overwrite the cached feed. Best-effort: write failures are ignored. */
export async function saveOutages(reports: OutageReport[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reports))
  } catch {
    // The cache is a convenience; the stream is the source of truth, so a failed write is harmless.
  }
}

/** Load the persisted "recently viewed outages" map. Returns `{}` on missing or corrupt data. */
export async function loadViewed(): Promise<ViewedMap> {
  try {
    const raw = await AsyncStorage.getItem(VIEWED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as ViewedMap) : {}
  } catch {
    return {}
  }
}

/** Overwrite the persisted viewed map. Best-effort. */
export async function saveViewed(viewed: ViewedMap): Promise<void> {
  try {
    await AsyncStorage.setItem(VIEWED_KEY, JSON.stringify(viewed))
  } catch {
    // Best-effort: losing the viewed map just means a resolved outage might drop instead of linger.
  }
}
