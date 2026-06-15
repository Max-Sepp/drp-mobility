import { apiClient } from '@/api/client'
import { type FetchResult, useCachedResource } from '@/api/cachedResource'
import type { components } from '@/api/schema.d'

export type EquipmentSummary = components['schemas']['EquipmentSummary']

type UseEquipment = {
  equipment: EquipmentSummary[]
  loading: boolean
  error: boolean
}

const CACHE_KEY = 'equipment_v1'

async function fetchEquipment(etag: string | null): Promise<FetchResult<EquipmentSummary[]>> {
  const { data, response } = await apiClient.GET('/equipment', {
    headers: etag ? { 'If-None-Match': etag } : {},
  })
  return { data, response }
}

/**
 * The full equipment list (lifts / escalators across every station). Rarely-changing reference
 * data, so it's cached in AsyncStorage and revalidated with an ETag. Callers filter the list
 * client-side (by station / type) rather than hitting the network per station.
 */
export function useEquipment(): UseEquipment {
  const { data, loading, error } = useCachedResource(CACHE_KEY, fetchEquipment)
  return { equipment: data ?? [], loading, error }
}
