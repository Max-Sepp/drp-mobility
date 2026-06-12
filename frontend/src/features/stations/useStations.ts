import { apiClient } from '@/api/client'
import { type FetchResult, useCachedResource } from '@/api/cachedResource'
import type { components } from '@/api/schema.d'

export type StationDetail = components['schemas']['StationDetail']
export type PlatformDetail = components['schemas']['PlatformSchema']

type UseStations = {
  stations: StationDetail[]
  loading: boolean
  error: boolean
}

// Bumped from `stations_v1`: the stored shape is now an { etag, data, cachedAt } envelope.
const CACHE_KEY = 'stations_v2'

async function fetchStations(etag: string | null): Promise<FetchResult<StationDetail[]>> {
  const { data, response } = await apiClient.GET('/stations', {
    headers: etag ? { 'If-None-Match': etag } : {},
  })
  return { data, response }
}

/**
 * Fetches the full station list (with platforms) from the backend.
 * Loads from AsyncStorage on mount (instant, works offline), then revalidates with an ETag —
 * an unchanged list comes back as a 304 and the cached copy is reused.
 */
export function useStations(): UseStations {
  const { data, loading, error } = useCachedResource(CACHE_KEY, fetchStations)
  return { stations: data ?? [], loading, error }
}

/** The distinct lines a station serves, gathered across all its platforms. */
export function stationLines(station: StationDetail): string[] {
  return [...new Set(station.platforms.flatMap((p) => p.lines))].sort()
}
