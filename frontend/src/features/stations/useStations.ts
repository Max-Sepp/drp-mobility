import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'

export type StationDetail = components['schemas']['StationDetail']
export type PlatformDetail = components['schemas']['PlatformSchema']

type UseStations = {
  stations: StationDetail[]
  loading: boolean
  error: boolean
}

const CACHE_KEY = 'stations_v1'

/**
 * Fetches the full station list (with platforms) from the backend.
 * Loads from AsyncStorage on mount (instant, works offline), then refreshes
 * from the API in the background and persists the latest data.
 */
export function useStations(): UseStations {
  const [stations, setStations] = useState<StationDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let hadCache = false

    async function load() {
      try {
        const cached = await AsyncStorage.getItem(CACHE_KEY)
        if (active && cached) {
          setStations(JSON.parse(cached))
          setLoading(false)
          hadCache = true
        }
      } catch {}

      try {
        const { data } = await apiClient.GET('/stations')
        if (!active) return
        if (data) {
          setStations(data)
          setLoading(false)
          AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)).catch(() => {})
        } else if (!hadCache) {
          setError(true)
          setLoading(false)
        }
      } catch {
        // Network failure (e.g. backend unreachable). Keep cached data if we
        // have it; otherwise surface the error state.
        if (!active) return
        if (!hadCache) {
          setError(true)
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  return { stations, loading, error }
}

/** The distinct lines a station serves, gathered across all its platforms. */
export function stationLines(station: StationDetail): string[] {
  return [...new Set(station.platforms.flatMap((p) => p.lines))].sort()
}
