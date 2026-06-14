import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { StyleSheet } from 'react-native'
import MapView, { MapMarkerProps, Marker, Polyline, PoiClickEvent, Region } from 'react-native-maps'
import Svg, { Circle } from 'react-native-svg'
import { fuzzyScore } from '@/lib/fuzzy'
import { useAppHeading, useAppLocation } from '@/lib/LocationContext'
import stationMarkers from '@/features/map/data/stationMarkers.json'
import { UserLocationMarker } from '@/features/map/components/UserLocationMarker'
import type { LatLng, RouteGeometry } from '@/features/journey/lib/routeGeometry'

export type StationMapHandle = {
  recentre: () => void
  focusStation: (name: string) => void
  clearFocus: () => void
  fitToRoute: (coords: LatLng[]) => void
}

// A waypoint dot drawn at a route's start / end / interchange. All are white-filled with a dark
// ring so the start, the destination, and every on/off point read as the same kind of marker (the
// destination also carries a TfL roundel above it). Both ends of a walking transfer between two
// sections are emitted as interchanges, so each end of that gap gets its own circle.
function RouteWaypoint() {
  const size = 16
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 2}
        fill="white"
        stroke="#1f1f1f"
        strokeWidth={2}
      />
    </Svg>
  )
}

// How long to keep tracksViewChanges=true after a TrackedMarker mounts / re-arms. Long enough for
// an async-painting SVG child to land before we freeze the marker bitmap, short enough to avoid
// noticeable cost. Mirrors the pattern in UserLocationMarker.
const TRACK_DURATION_MS = 600

// A Marker that keeps tracksViewChanges=true for a short window after mounting, then turns it off.
// On iOS, react-native-maps snapshots a custom child view to draw the marker; an SVG/View child
// paints asynchronously, so a snapshot taken on the very first frame is empty and the map falls
// back to the default red system pin. Tracking for a brief window lets the real custom view get
// captured, so the system pin never appears; we then stop tracking to avoid the per-frame bitmap
// cost. The timer is unconditional (unlike an onLayout trigger, which never fires on iOS if the
// child reports no layout — that would pin tracking on permanently and jank the map). `trackKey`
// re-opens the window when it changes, so a marker whose content updates after mount (e.g. the
// focused roundel rescaling on zoom) gets a fresh bitmap.
function TrackedMarker({ trackKey, ...props }: MapMarkerProps & { trackKey?: unknown }) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_DURATION_MS)
    // Cleanup runs before the next effect (trackKey change) and on unmount, re-arming tracking so
    // updated content is recaptured.
    return () => {
      clearTimeout(timer)
      setTracksViewChanges(true)
    }
  }, [trackKey])
  return <Marker {...props} tracksViewChanges={tracksViewChanges} />
}

const LONDON: Region = {
  latitude: 51.5074,
  longitude: -0.1276,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
}

// Suffixes that map providers append to station names.
const STATION_SUFFIXES = [
  'elizabeth line station',
  'overground station',
  'underground station',
  'railway station',
  'dlr station',
  'tube station',
  'rail station',
  'station',
]

function normalisePoiName(raw: string): string {
  let n = raw.toLowerCase().trim()
  for (const suffix of STATION_SUFFIXES) {
    if (n.endsWith(suffix)) {
      return n.slice(0, -suffix.length).trim()
    }
  }
  return n
}

function distanceMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111_000
  const dLng = (lng2 - lng1) * 111_000 * Math.cos((lat1 * Math.PI) / 180)
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

const DISTANCE_THRESHOLD_M = 150
const FUZZY_THRESHOLD = 0.4

function findStation(poiName: string, lat: number, lng: number): string | null {
  const normalised = normalisePoiName(poiName)
  const match = stationMarkers.find((s) => {
    if (distanceMetres(lat, lng, s.lat, s.lng) > DISTANCE_THRESHOLD_M) return false
    return fuzzyScore(normalised, s.name) >= FUZZY_THRESHOLD
  })
  return match?.name ?? null
}

const LAT_DELTA = 0.002

// Upper bound on route waypoint dots (start + end + per-leg interchanges). Comfortably above any
// realistic journey; the pool is fixed-size and always mounted (see the render) so unused slots are
// simply hidden. A route with more waypoints than this would just drop the extras — not a concern
// in practice.
const WAYPOINT_POOL_SIZE = 24

type Props = {
  onStationPress: (name: string) => void
  bottomInset: number
  // When set (e.g. a staff member's on-shift station), the map centres here on open instead
  // of the device location. GPS is often unavailable underground, so this is the reliable
  // anchor for staff. The manual recentre button still uses GPS.
  anchor?: { latitude: number; longitude: number } | null
  // The journey to draw, derived from the active/previewed journey. Null clears the overlay.
  route?: RouteGeometry | null
}

export const StationMap = forwardRef<StationMapHandle, Props>(function StationMap(
  { onStationPress, bottomInset, anchor, route },
  ref,
) {
  const coords = useAppLocation()
  const heading = useAppHeading()
  const mapRef = useRef<MapView>(null)

  const animateToUser = useCallback(() => {
    if (!coords) return
    mapRef.current?.animateToRegion(
      {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      600,
    )
  }, [coords])

  const focusStation = useCallback((name: string) => {
    const station = stationMarkers.find((s) => s.name === name) ?? null
    if (!station) return
    // Defer one frame so React has committed the updated mapPadding prop to the native
    // map before the animation fires. Without this, animateToRegion uses stale padding
    // and the camera jumps a second time when mapPadding catches up (visible on Android).
    requestAnimationFrame(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: station.lat,
          longitude: station.lng,
          latitudeDelta: LAT_DELTA,
          longitudeDelta: LAT_DELTA,
        },
        600,
      )
    })
  }, [])

  // Retained on the handle for the search/close flow; there is no longer a focus marker to clear,
  // so this is a no-op. (Camera recentring on close is handled by the caller.)
  const clearFocus = useCallback(() => {}, [])

  // Frame the whole route, centred in the band left visible above the bottom sheet. The map's own
  // mapPadding already reserves the sheet's height, so animateToRegion fits the region into the
  // visible band and centres it there — we must NOT also scale the span by the visible fraction, as
  // an earlier version did: that double-counts the inset and zooms the trip out to a tiny dot. We
  // ask for a span 1.2x the route's bounding box on each axis, so the route fills the frame with a
  // little breathing room; the map fits whichever axis is tighter and centres the other. A small
  // floor keeps a one-stop hop from zooming in absurdly far.
  const fitToRoute = useCallback((coords: LatLng[]) => {
    if (coords.length === 0) return
    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity
    for (const c of coords) {
      if (c.latitude < minLat) minLat = c.latitude
      if (c.latitude > maxLat) maxLat = c.latitude
      if (c.longitude < minLng) minLng = c.longitude
      if (c.longitude > maxLng) maxLng = c.longitude
    }
    const MARGIN = 1.2
    mapRef.current?.animateToRegion(
      {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max((maxLat - minLat) * MARGIN, 0.005),
        longitudeDelta: Math.max((maxLng - minLng) * MARGIN, 0.005),
      },
      600,
    )
  }, [])

  useImperativeHandle(
    ref,
    () => ({ recentre: animateToUser, focusStation, clearFocus, fitToRoute }),
    [animateToUser, focusStation, clearFocus, fitToRoute],
  )

  // Centre on open. The anchor (staff's shift station) always wins and is honoured even if it
  // resolves late (station data loads async) — so it overrides an earlier GPS centring exactly
  // once. With no anchor, centre on the device location the first time coords become available.
  const anchoredRef = useRef(false)
  const centredRef = useRef(false)
  useEffect(() => {
    if (anchor && !anchoredRef.current) {
      anchoredRef.current = true
      centredRef.current = true
      mapRef.current?.animateToRegion(
        {
          latitude: anchor.latitude,
          longitude: anchor.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        600,
      )
    } else if (!anchor && coords && !centredRef.current) {
      centredRef.current = true
      animateToUser()
    }
  }, [anchor, coords, animateToUser])

  function handlePoiClick(event: PoiClickEvent) {
    const { name, coordinate } = event.nativeEvent
    const station = findStation(name, coordinate.latitude, coordinate.longitude)
    if (station) onStationPress(station)
  }

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={LONDON}
      mapPadding={{ top: 0, right: 0, left: 0, bottom: bottomInset }}
      onPoiClick={handlePoiClick}
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {route?.legs.map((leg, i) => (
        <Polyline
          key={`leg-${i}`}
          coordinates={leg.coords}
          strokeColor={leg.color}
          strokeWidth={leg.isWalking ? 3 : 6}
          lineCap="round"
          lineJoin="round"
          lineDashPattern={leg.isWalking ? [2, 5] : undefined}
          zIndex={1}
        />
      ))}
      {/* Waypoint dots are drawn from a fixed pool of permanently-mounted markers. We never
          conditionally render them per route: on the New Architecture, react-native-maps (1.20.x)
          fails to tear down a removed custom-child marker and leaves a default red pin behind as a
          ghost — which is what stranded a pin at the previous journey's destination when a route
          cleared. Instead every slot stays mounted; we move it (`coordinate`) and show/hide it
          (`opacity`) as the route changes. The dot child is always rendered so the snapshot is
          never empty (the other way the red fallback appears), and `trackKey` re-arms the snapshot
          window when a slot's position changes so the moved dot re-captures cleanly. */}
      {Array.from({ length: WAYPOINT_POOL_SIZE }, (_, i) => {
        const marker = route?.markers[i]
        return (
          <TrackedMarker
            key={`waypoint-${i}`}
            coordinate={marker?.coord ?? { latitude: LONDON.latitude, longitude: LONDON.longitude }}
            anchor={{ x: 0.5, y: 0.5 }}
            opacity={marker ? 1 : 0}
            trackKey={marker ? `${marker.coord.latitude},${marker.coord.longitude}` : 'hidden'}
          >
            <RouteWaypoint />
          </TrackedMarker>
        )
      })}
      {coords && (
        <UserLocationMarker
          latitude={coords.latitude}
          longitude={coords.longitude}
          heading={heading}
        />
      )}
      {/* No focused-station marker: on the New Architecture, react-native-maps (1.20.x) leaves a
          ghost default red pin behind when a custom-child marker is removed/moved, and no amount of
          tracksViewChanges juggling reliably prevents it. The search/focus flow just animates the
          camera to the station instead — the named POI label on the basemap already identifies it. */}
    </MapView>
  )
})

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
})
