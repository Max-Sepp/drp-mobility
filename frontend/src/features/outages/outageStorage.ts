// On-device cache of the outage feed, so the most recent reports are shown instantly on launch —
// before the SSE stream connects and sends its fresh snapshot. Plain JSON under one AsyncStorage
// key, mirroring the journey storage in src/features/journey/api/savedJourneys.ts.

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { OutageReport } from '@/features/outages/types'

const STORAGE_KEY = '@drp/outage-reports'

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
