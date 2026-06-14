import { apiClient } from '@/api/client'
import { type FetchResult, useCachedResource } from '@/api/cachedResource'
import type { components } from '@/api/schema.d'

export type EquipmentType = components['schemas']['EquipmentTypeSchema']

type UseEquipmentTypes = {
  equipmentTypes: EquipmentType[]
  loading: boolean
  error: boolean
}

const CACHE_KEY = 'equipment_types_v1'

async function fetchEquipmentTypes(etag: string | null): Promise<FetchResult<EquipmentType[]>> {
  const { data, response } = await apiClient.GET('/equipment-types', {
    headers: etag ? { 'If-None-Match': etag } : {},
  })
  return { data, response }
}

/** The fixed set of equipment types (lift / escalator / overcrowding / custom), cached and
 * revalidated with an ETag like the other reference data. */
export function useEquipmentTypes(): UseEquipmentTypes {
  const { data, loading, error } = useCachedResource(CACHE_KEY, fetchEquipmentTypes)
  return { equipmentTypes: data ?? [], loading, error }
}
