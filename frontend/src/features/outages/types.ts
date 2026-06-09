import type { components } from '@/api/schema.d'

/** A single outage report, identical in shape to the GET /outage-reports response. */
export type OutageReport = components['schemas']['OutageReportSummary']

/**
 * Named SSE events emitted by GET /outage-reports/stream. These are not part of the OpenAPI schema
 * (SSE isn't modelled there), so the payload shapes below are declared by hand. `snapshot` and
 * `created` carry generated `OutageReport` shapes; `deleted`/`resolved` carry small ad-hoc payloads.
 */
export type OutageStreamEvent = 'snapshot' | 'created' | 'deleted' | 'resolved' | 'verified'

export type SnapshotData = { reports: OutageReport[] }
export type DeletedData = { id: number }
export type ResolvedData = { failure_id: number }
