import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'

// Reference data (stations, equipment, ...) changes only on a backend reseed, so we cache it
// aggressively in AsyncStorage and revalidate with an ETag: an unchanged payload comes back as a
// 304 with no body. A copy is still discarded and refetched in full after a week so nothing can
// go stale indefinitely.
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

type Envelope<T> = { etag: string | null; data: T; cachedAt: number }

export type FetchResult<T> = { data?: T; response: Response }

type UseCachedResource<T> = {
  data: T | null
  loading: boolean
  error: boolean
}

/**
 * Cache-first loader with HTTP revalidation.
 *
 * 1. Loads `{ etag, data, cachedAt }` from AsyncStorage on mount (instant, works offline).
 *    A cache older than {@link CACHE_TTL_MS} is discarded and refetched in full.
 * 2. Revalidates via the caller's `fetcher`, passing the cached ETag (or `null`) so it can send
 *    `If-None-Match`.
 * 3. On `304` it keeps the cache; on `200` it stores the new envelope.
 *
 * `cacheKey` is the AsyncStorage key; `fetcher` performs the conditional request.
 */
export function useCachedResource<T>(
  cacheKey: string,
  fetcher: (etag: string | null) => Promise<FetchResult<T>>,
): UseCachedResource<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let hadCache = false
    let etag: string | null = null

    async function load() {
      try {
        const raw = await AsyncStorage.getItem(cacheKey)
        if (active && raw) {
          const env: Envelope<T> = JSON.parse(raw)
          // Expired caches are dropped: keep `etag` null so we pull a fresh full payload.
          if (Date.now() - env.cachedAt < CACHE_TTL_MS) {
            etag = env.etag
            setData(env.data)
            setLoading(false)
            hadCache = true
          }
        }
      } catch {}

      try {
        const { data: fresh, response } = await fetcher(etag)
        if (!active) return
        if (response.status === 304) {
          // Cache is still current; nothing to persist.
          setLoading(false)
        } else if (fresh !== undefined) {
          setData(fresh)
          setLoading(false)
          const env: Envelope<T> = {
            etag: response.headers.get('etag'),
            data: fresh,
            cachedAt: Date.now(),
          }
          AsyncStorage.setItem(cacheKey, JSON.stringify(env)).catch(() => {})
        } else if (!hadCache) {
          setError(true)
          setLoading(false)
        }
      } catch {
        // Network failure (e.g. backend unreachable). Keep whatever cache we loaded; only
        // surface an error when we have nothing to show.
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
  }, [cacheKey, fetcher])

  return { data, loading, error }
}
