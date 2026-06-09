import type { components } from '@/api/schema.d'

/** A single outage report, identical in shape to the GET /outage-reports response. */
export type OutageReport = components['schemas']['OutageReportSummary']

/** One on-site verification of an outage (failure): when it happened and an optional note. */
export type Verification = components['schemas']['OutageReportVerificationSchema']

/**
 * Named SSE events emitted by GET /outage-reports/stream. These are not part of the OpenAPI schema
 * (SSE isn't modelled there), so the payload shapes below are declared by hand. `snapshot` and
 * `created` carry generated `OutageReport` shapes; `deleted`/`resolved`/`verified` carry small
 * ad-hoc payloads. `verified` is failure-scoped: it carries the failure's full verification list.
 */
export type OutageStreamEvent = 'snapshot' | 'created' | 'deleted' | 'resolved' | 'verified'

export type SnapshotData = { reports: OutageReport[] }
export type DeletedData = { id: number }
export type ResolvedData = {
  failure_id: number
  resolved_at: string | null
  description: string | null
}
export type VerifiedData = { failure_id: number; verifications: Verification[] }
