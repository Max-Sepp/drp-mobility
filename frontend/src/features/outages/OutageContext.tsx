import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import EventSource from 'react-native-sse'
import { BASE_URL } from '@/api/client'
import { loadOutages, saveOutages } from '@/features/outages/outageStorage'
import type {
  DeletedData,
  OutageReport,
  OutageStreamEvent,
  ResolvedData,
  SnapshotData,
} from '@/features/outages/types'

type OutageContextValue = {
  /** The current open-outage feed across all stations, newest first. */
  reports: OutageReport[]
  /** True only until the first snapshot (or cached data) is available. */
  loading: boolean
  /** Whether the SSE stream is currently connected. */
  connected: boolean
}

const OutageContext = createContext<OutageContextValue | null>(null)

const STREAM_URL = `${BASE_URL}/outage-reports/stream`

// Match the backend's ordering (breakdown_time descending) so inserts keep the feed newest-first.
function byBreakdownDesc(a: OutageReport, b: OutageReport): number {
  return b.breakdown_time.localeCompare(a.breakdown_time)
}

// Replace any existing report with the same id, then re-sort. Idempotent, so a `created` event
// that overlaps the snapshot (or arrives twice) can't duplicate a row.
function upsert(reports: OutageReport[], incoming: OutageReport): OutageReport[] {
  return [...reports.filter((r) => r.id !== incoming.id), incoming].sort(byBreakdownDesc)
}

/**
 * Holds the live outage feed. On mount it shows the cached feed immediately, then opens an SSE
 * stream: every (re)connection delivers a full `snapshot` that replaces local state (always the
 * server's authoritative current state), followed by live `created`/`deleted`/`resolved` deltas.
 * The feed is persisted on every change so the next launch starts warm.
 */
export function OutageProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<OutageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const hydrated = useRef(false)
  const receivedSnapshot = useRef(false)

  // Show cached reports instantly, before the stream connects — unless a snapshot already landed.
  useEffect(() => {
    let active = true
    ;(async () => {
      const cached = await loadOutages()
      if (active && cached.length > 0 && !receivedSnapshot.current) {
        setReports(cached)
        setLoading(false)
      }
      hydrated.current = true
    })()
    return () => {
      active = false
    }
  }, [])

  // Persist whenever the feed changes (but not during the initial cache hydration, which would
  // just write the cache back to itself).
  useEffect(() => {
    if (hydrated.current) void saveOutages(reports)
  }, [reports])

  useEffect(() => {
    console.log('[outages] opening SSE to', STREAM_URL)
    const es = new EventSource<OutageStreamEvent>(STREAM_URL)

    es.addEventListener('open', () => {
      console.log('[outages] SSE open')
      setConnected(true)
    })
    es.addEventListener('error', (event) => {
      console.log('[outages] SSE error', JSON.stringify(event))
      setConnected(false)
      // Don't spin forever if the server is unreachable — fall back to whatever is cached.
      setLoading(false)
    })

    es.addEventListener('snapshot', (event) => {
      receivedSnapshot.current = true
      const { reports: next } = JSON.parse(event.data ?? '{"reports":[]}') as SnapshotData
      console.log('[outages] snapshot:', next.length, 'reports')
      setReports([...next].sort(byBreakdownDesc))
      setLoading(false)
    })

    es.addEventListener('created', (event) => {
      const report = JSON.parse(event.data ?? 'null') as OutageReport | null
      if (report) setReports((prev) => upsert(prev, report))
    })

    es.addEventListener('deleted', (event) => {
      const { id } = JSON.parse(event.data ?? '{}') as DeletedData
      setReports((prev) => prev.filter((r) => r.id !== id))
    })

    es.addEventListener('resolved', (event) => {
      const { failure_id } = JSON.parse(event.data ?? '{}') as ResolvedData
      setReports((prev) => prev.filter((r) => r.failure_id !== failure_id))
    })

    return () => {
      es.removeAllEventListeners()
      es.close()
    }
  }, [])

  return (
    <OutageContext.Provider value={{ reports, loading, connected }}>
      {children}
    </OutageContext.Provider>
  )
}

export function useOutages(): OutageContextValue {
  const ctx = useContext(OutageContext)
  if (!ctx) throw new Error('useOutages must be used within an OutageProvider')
  return ctx
}
