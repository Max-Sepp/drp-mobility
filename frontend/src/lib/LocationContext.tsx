import * as Location from 'expo-location'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

type Coords = Location.LocationObject['coords']

const LocationContext = createContext<Coords | null>(null)

/**
 * Silently requests foreground permission on mount and starts a position watch.
 * Cached coords are available instantly to any child via useAppLocation().
 * If permission is denied at launch, coords stays null — call sites request
 * permission themselves (with a user-visible prompt) when they actually need it.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [coords, setCoords] = useState<Coords | null>(null)
  const subRef = useRef<Location.LocationSubscription | null>(null)

  useEffect(() => {
    let cancelled = false

    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (cancelled || status !== 'granted') return
      Location.watchPositionAsync(
        // 30 s time gate + 50 m distance gate — OS picks whichever fires first.
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30_000, distanceInterval: 50 },
        (loc) => setCoords(loc.coords),
      ).then((sub) => {
        if (cancelled) {
          sub.remove()
          return
        }
        subRef.current = sub
      })
    })

    return () => {
      cancelled = true
      subRef.current?.remove()
      subRef.current = null
    }
  }, [])

  return <LocationContext.Provider value={coords}>{children}</LocationContext.Provider>
}

/** Returns the most recently cached device coordinates, or null if unavailable. */
export function useAppLocation(): Coords | null {
  return useContext(LocationContext)
}
