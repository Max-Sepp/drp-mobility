import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import type { IssueSeverity } from '@/features/outages/severity'

/** A station-level accessibility advisory from TfL, identical to the GET /station-alerts shape. */
export type StationAlert = components['schemas']['StationAlertSchema']
type Kind = components['schemas']['StationAlertKind']

/** Human-readable heading per alert kind. */
export const ALERT_KIND_LABEL: Record<Kind, string> = {
  lift_outage: 'Lift out of service',
  step_free_unavailable: 'No step-free access',
  closure: 'Station closure',
  accessibility: 'Accessibility issue',
  other: 'Service notice',
}

// Kinds that block step-free access render red; the rest render amber. Mirrors reportSeverity.
const DANGER_KINDS = new Set<Kind>(['lift_outage', 'step_free_unavailable', 'closure'])

export function alertSeverity(alert: StationAlert): IssueSeverity {
  return DANGER_KINDS.has(alert.kind) ? 'danger' : 'warning'
}

/** Worst severity across a set of alerts, or null when empty. */
export function worstAlertSeverity(alerts: StationAlert[]): IssueSeverity | null {
  if (alerts.length === 0) return null
  return alerts.some((a) => alertSeverity(a) === 'danger') ? 'danger' : 'warning'
}

/**
 * Fetch the active TfL alerts for one station. Refetches whenever the station changes (i.e. when
 * the sheet opens for a new station); there is no SSE channel for alerts, so this is a plain
 * on-open fetch.
 */
export function useStationAlerts(stationId: number | undefined): {
  alerts: StationAlert[]
  loading: boolean
} {
  const [alerts, setAlerts] = useState<StationAlert[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (stationId == null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAlerts([])
      return
    }
    let active = true
    setLoading(true)
    apiClient
      .GET('/station-alerts', { params: { query: { active: true, station_id: stationId } } })
      .then(({ data }) => {
        if (active) setAlerts(data ?? [])
      })
      .catch(() => {
        if (active) setAlerts([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [stationId])

  return { alerts, loading }
}
