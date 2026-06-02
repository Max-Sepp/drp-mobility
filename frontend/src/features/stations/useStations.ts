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

/** Fetches the full station list (with platforms) from the backend once on mount. */
export function useStations(): UseStations {
  const [stations, setStations] = useState<StationDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    apiClient.GET('/stations').then(({ data }) => {
      if (!active) return
      if (data) setStations(data)
      else setError(true)
      setLoading(false)
    })
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
