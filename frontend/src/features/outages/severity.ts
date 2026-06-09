import type { components } from '@/api/schema.d'

type OutageReport = components['schemas']['OutageReportSummary']

export type IssueSeverity = 'warning' | 'danger'

/**
 * Single source of truth: equipment type name → severity level.
 *
 * - 'warning' renders amber (non-blocking, informational)
 * - 'danger'  renders red   (step-free access impacted)
 *
 * To add a new issue type: add its equipment_type.name here.
 * All UI (card colours, section banner) derives from this map automatically.
 * Anything not listed defaults to 'danger'.
 */
const SEVERITY_MAP: Record<string, IssueSeverity> = {
  overcrowding: 'warning',
  custom: 'warning',
}

export function reportSeverity(report: OutageReport): IssueSeverity {
  return SEVERITY_MAP[report.failure.equipment.equipment_type.name] ?? 'danger'
}

/**
 * Returns the worst severity across a set of reports.
 * 'danger' beats 'warning'. Returns null for an empty array.
 */
export function overallSeverity(reports: OutageReport[]): IssueSeverity | null {
  if (reports.length === 0) return null
  return reports.some((r) => reportSeverity(r) === 'danger') ? 'danger' : 'warning'
}
