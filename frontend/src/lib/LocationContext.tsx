import * as Location from 'expo-location'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Platform } from 'react-native'

type Coords = Location.LocationObject['coords']

type LocationState = {
  coords: Coords | null
  heading: number | null // degrees clockwise from true north, null if unavailable
}

const LocationContext = createContext<LocationState>({ coords: null, heading: null })

// Ignore heading changes smaller than this (degrees). The compass sensor jitters
// by a degree or two while the device is still; without this filter every jitter
// re-renders the map marker.
const HEADING_THRESHOLD_DEG = 2

/** Smallest absolute angular difference between two bearings, accounting for wraparound. */
function headingDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

/**
 * Silently requests foreground permission on mount and starts a position + heading watch.
 * Cached values are available instantly to any child via useAppLocation() / useAppHeading().
 * If permission is denied at launch, both stay null.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [coords, setCoords] = useState<Coords | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const posSubRef = useRef<Location.LocationSubscription | null>(null)
  const headSubRef = useRef<Location.LocationSubscription | null>(null)

  useEffect(() => {
    let cancelled = false

    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (cancelled || status !== 'granted') return

      // Keep the dot following the user: update every few seconds / few metres. A coordinate
      // change repositions the marker natively (no bitmap re-capture, so no flicker — see
      // UserLocationMarker), so a responsive interval is cheap. The old 50 m / 30 s filter left
      // the dot frozen for normal walking-scale movement.
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3_000, distanceInterval: 5 },
        (loc) => setCoords(loc.coords),
      ).then((sub) => {
        if (cancelled) {
          sub.remove()
          return
        }
        posSubRef.current = sub
      })

      // Heading only drives the directional cone, which is Android-only (UserLocationMarker): on
      // iOS (Apple Maps) the cone can't rotate without flicker, so the marker shows the dot alone.
      // Skip the heading watch elsewhere to avoid needless compass battery drain.
      if (Platform.OS === 'android') {
        // Throttle: process at most one heading reading per 300ms.
        // The compass fires far more often than that; throttling limits how often the
        // map marker re-renders to rotate its cone.
        let lastHeadingMs = 0
        Location.watchHeadingAsync((h) => {
          const now = Date.now()
          if (now - lastHeadingMs < 300) return
          lastHeadingMs = now
          const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading
          if (deg < 0) return
          setHeading((prev) =>
            prev !== null && headingDelta(prev, deg) < HEADING_THRESHOLD_DEG ? prev : deg,
          )
        }).then((sub) => {
          if (cancelled) {
            sub.remove()
            return
          }
          headSubRef.current = sub as unknown as Location.LocationSubscription
        })
      }
    })

    return () => {
      cancelled = true
      posSubRef.current?.remove()
      headSubRef.current?.remove()
      posSubRef.current = null
      headSubRef.current = null
    }
  }, [])

  return <LocationContext.Provider value={{ coords, heading }}>{children}</LocationContext.Provider>
}

/** Returns the most recently cached device coordinates, or null if unavailable. */
export function useAppLocation(): Coords | null {
  return useContext(LocationContext).coords
}

/** Returns the device heading in degrees clockwise from true north, or null if unavailable. */
export function useAppHeading(): number | null {
  return useContext(LocationContext).heading
}
