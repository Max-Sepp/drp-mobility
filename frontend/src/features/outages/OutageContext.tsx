import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import EventSource from 'react-native-sse'
import { BASE_URL } from '@/api/client'
import {
  loadOutages,
  loadViewed,
  saveOutages,
  saveViewed,
  type ViewedMap,
} from '@/features/outages/outageStorage'
import type {
  DeletedData,
  OutageReport,
  OutageStreamEvent,
  ResolvedData,
  SnapshotData,
  VerifiedData,
} from '@/features/outages/types'

type OutageContextValue = {
  /** The current open-outage feed across all stations, newest first. May also include recently
   * resolved outages the user viewed, shown as "Resolved" until their window elapses. */
  reports: OutageReport[]
  /** True only until the first snapshot (or cached data) is available. */
  loading: boolean
  /** Whether the SSE stream is currently connected. */
  connected: boolean
  /** Record that the user has just viewed an outage. If it is later resolved, it lingers as a
   * "Resolved" card (for RESOLVED_VISIBLE_MS) instead of vanishing from the feed. */
  markViewed: (failureId: number) => void
}

const OutageContext = createContext<OutageContextValue | null>(null)

const STREAM_URL = `${BASE_URL}/outage-reports/stream`

// How long a resolved outage stays visible (as a "Resolved" card) to someone who recently viewed
// it, before it auto-dismisses.
const RESOLVED_VISIBLE_MS = 60 * 60 * 1000

// Match the backend's ordering (breakdown_time descending) so inserts keep the feed newest-first.
function byBreakdownDesc(a: OutageReport, b: OutageReport): number {
  return b.breakdown_time.localeCompare(a.breakdown_time)
}

// Replace any existing report with the same id, then re-sort. Idempotent, so a `created` event
// that overlaps the snapshot (or arrives twice) can't duplicate a row.
function upsert(reports: OutageReport[], incoming: OutageReport): OutageReport[] {
  return [...reports.filter((r) => r.id !== incoming.id), incoming].sort(byBreakdownDesc)
}

// True once a resolved report has outlived its visible window and should be dropped from the feed.
function isResolvedExpired(report: OutageReport, now: number): boolean {
  if (!report.failure.resolved) return false
  const resolvedAt = report.failure.resolved_at ? Date.parse(report.failure.resolved_at) : null
  // A resolved report with no (parseable) timestamp is dropped immediately rather than lingering.
  if (resolvedAt === null || Number.isNaN(resolvedAt)) return true
  return now - resolvedAt > RESOLVED_VISIBLE_MS
}

function pruneExpired(reports: OutageReport[], now = Date.now()): OutageReport[] {
  return reports.filter((r) => !isResolvedExpired(r, now))
}

/**
 * Holds the live outage feed. On mount it shows the cached feed immediately, then opens an SSE
 * stream: every (re)connection delivers a full `snapshot` of open outages, followed by live
 * `created`/`deleted`/`resolved`/`verified` deltas. When an outage the user has recently viewed is
 * resolved, it is kept and flipped to a "Resolved" state (with the reason) instead of being dropped
 * — and auto-dismissed once its window elapses. The feed is persisted on every change.
 */
export function OutageProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<OutageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const hydrated = useRef(false)
  const receivedSnapshot = useRef(false)
  // Persisted failure_id → last-viewed ISO time. Held in a ref so the SSE handlers (set up once)
  // always read the latest value without re-subscribing.
  const viewedRef = useRef<ViewedMap>({})

  // Show cached reports + viewed map instantly, before the stream connects — unless a snapshot
  // already landed.
  useEffect(() => {
    let active = true
    ;(async () => {
      const [cached, viewed] = await Promise.all([loadOutages(), loadViewed()])
      if (!active) return
      viewedRef.current = viewed
      if (cached.length > 0 && !receivedSnapshot.current) {
        setReports(pruneExpired(cached))
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

  const markViewed = useCallback((failureId: number) => {
    viewedRef.current = { ...viewedRef.current, [failureId]: new Date().toISOString() }
    void saveViewed(viewedRef.current)
  }, [])

  // Auto-dismiss resolved cards once their visible window elapses (checked once a minute).
  useEffect(() => {
    const timer = setInterval(() => {
      setReports((prev) => {
        const pruned = pruneExpired(prev)
        return pruned.length === prev.length ? prev : pruned
      })
    }, 60 * 1000)
    return () => clearInterval(timer)
  }, [])

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
      // The snapshot lists open outages only. Re-add any resolved cards we're still showing
      // (recently viewed, within their window) so a resolution the user saw isn't lost on reconnect.
      setReports((prev) => {
        const keptResolved = pruneExpired(prev).filter((r) => r.failure.resolved)
        const openIds = new Set(next.map((r) => r.id))
        const merged = [...next, ...keptResolved.filter((r) => !openIds.has(r.id))]
        return merged.sort(byBreakdownDesc)
      })
      setLoading(false)
    })

    es.addEventListener('created', (event) => {
      const report = JSON.parse(event.data ?? 'null') as OutageReport | null
      if (report) setReports((prev) => upsert(prev, report))
    })

    es.addEventListener('verified', (event) => {
      // Verification is failure-scoped: write the new list onto every report under that failure so
      // the embedded `failure.verifications` (and derived `failure.verified`) stay in sync.
      const { failure_id, verifications } = JSON.parse(event.data ?? '{}') as VerifiedData
      setReports((prev) =>
        prev.map((r) =>
          r.failure_id === failure_id
            ? { ...r, failure: { ...r.failure, verifications, verified: verifications.length > 0 } }
            : r,
        ),
      )
    })

    es.addEventListener('deleted', (event) => {
      const { id } = JSON.parse(event.data ?? '{}') as DeletedData
      setReports((prev) => prev.filter((r) => r.id !== id))
    })

    es.addEventListener('resolved', (event) => {
      const { failure_id, resolved_at, description } = JSON.parse(
        event.data ?? '{}',
      ) as ResolvedData
      const viewedAt = viewedRef.current[failure_id]
      const recentlyViewed = viewedAt
        ? Date.now() - Date.parse(viewedAt) < RESOLVED_VISIBLE_MS
        : false
      setReports((prev) => {
        if (!recentlyViewed) {
          // Not recently viewed — drop the failure's reports from the open feed, as before.
          return prev.filter((r) => r.failure_id !== failure_id)
        }
        // Recently viewed: keep the reports but flip the embedded failure to resolved with its
        // reason, so the card shows a "Resolved" state instead of disappearing.
        return prev.map((r) =>
          r.failure_id === failure_id
            ? {
                ...r,
                failure: {
                  ...r.failure,
                  resolved: true,
                  resolved_at,
                  resolution_description: description,
                },
              }
            : r,
        )
      })
    })

    return () => {
      es.removeAllEventListeners()
      es.close()
    }
  }, [])

  return (
    <OutageContext.Provider value={{ reports, loading, connected, markViewed }}>
      {children}
    </OutageContext.Provider>
  )
}

export function useOutages(): OutageContextValue {
  const ctx = useContext(OutageContext)
  if (!ctx) throw new Error('useOutages must be used within an OutageProvider')
  return ctx
}
