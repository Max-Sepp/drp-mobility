import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import MapView, { MapMarkerProps, Marker, Polyline, PoiClickEvent, Region } from 'react-native-maps'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { fuzzyScore } from '@/lib/fuzzy'
import { useAppHeading, useAppLocation } from '@/lib/LocationContext'
import stationMarkers from '@/features/map/data/stationMarkers.json'
import { UserLocationMarker } from '@/features/map/components/UserLocationMarker'
import type { LatLng, RouteGeometry } from '@/features/journey/lib/routeGeometry'

type StationMarkerEntry = (typeof stationMarkers)[number]

// Rendered from Underground.svg (viewBox 615.3×500). The bar extends beyond the circle
// on both sides (authentic roundel look), so the rendered width is wider than height.
// `scale` shrinks the roundel as the map zooms out so it stays a reasonable on-screen size
// instead of swamping the map at low zoom (markers are otherwise fixed-pixel).
const ROUNDEL_WIDTH = 55
const ROUNDEL_HEIGHT = 45
function StationRoundel({ scale }: { scale: number }) {
  return (
    <View
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 6,
      }}
    >
      <Svg width={ROUNDEL_WIDTH * scale} height={ROUNDEL_HEIGHT * scale} viewBox="0 0 615.3 500">
        {/* White fill so the map background doesn't show through the ring centre */}
        <Circle cx={308.15} cy={250} r={161.3} fill="white" />
        {/* Red donut ring */}
        <Path
          d="m469.5 250c0 89.1-72.3 161.3-161.3 161.3-89.1 0-161.3-72.2-161.3-161.3s72.1-161.3 161.2-161.3 161.4 72.2 161.4 161.3m-161.4-250c-138.1 0-250 111.9-250 250s111.9 250 250 250 250-111.9 250-250-111.9-250-250-250"
          fill="#e1251f"
          fillRule="nonzero"
        />
        {/* Blue bar */}
        <Rect y={199.5} width={615.3} height={101.1} fill="#000f9f" />
      </Svg>
    </View>
  )
}

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

// Roundel sizing vs. zoom. At the focus zoom (LAT_DELTA) the roundel renders full size; zooming
// further out shrinks it (down to ROUNDEL_MIN_SCALE) so it doesn't dominate the map, and zooming
// in is capped at full size so it never balloons. sqrt softens the curve so it scales gradually.
const ROUNDEL_MIN_SCALE = 0.4
function roundelScaleForDelta(latitudeDelta: number): number {
  const raw = Math.sqrt(LAT_DELTA / latitudeDelta)
  return Math.min(1, Math.max(ROUNDEL_MIN_SCALE, raw))
}

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
  const [focusedStation, setFocusedStation] = useState<StationMarkerEntry | null>(null)
  // Current camera zoom (latitude span), used to keep the focused roundel a sensible on-screen size.
  const [roundelScale, setRoundelScale] = useState(() => roundelScaleForDelta(LAT_DELTA))

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
    setFocusedStation(station)
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

  const clearFocus = useCallback(() => setFocusedStation(null), [])

  // Frame the whole route in the band left visible above the bottom sheet, centred there. We build
  // the region by hand and animate to it rather than using fitToCoordinates' edgePadding: that
  // padding *compounds* with the map's own mapPadding (which already reserves the sheet's height),
  // so the inset gets counted twice and an oversized total makes the map zoom right out (you end up
  // seeing half of Europe). Here the latitude span is inflated only by the visible fraction so the
  // route clears the sheet, and that fraction is clamped so a large/stale inset can never explode
  // the zoom. mapPadding shifts the centre up into the visible band, as it does for the other
  // animateToRegion calls.
  const fitToRoute = useCallback(
    (coords: LatLng[]) => {
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
      const screenH = Dimensions.get('window').height
      const visibleFraction = Math.min(1, Math.max(0.35, (screenH - bottomInset) / screenH))
      const MARGIN = 1.3
      mapRef.current?.animateToRegion(
        {
          latitude: (minLat + maxLat) / 2,
          longitude: (minLng + maxLng) / 2,
          latitudeDelta: Math.max(((maxLat - minLat) * MARGIN) / visibleFraction, 0.01),
          longitudeDelta: Math.max((maxLng - minLng) * MARGIN, 0.01),
        },
        600,
      )
    },
    [bottomInset],
  )

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
      onRegionChangeComplete={(region) =>
        setRoundelScale(roundelScaleForDelta(region.latitudeDelta))
      }
      showsMyLocationButton={false}
      showsCompass={false}
    >
      {route?.legs.map((leg, i) => (
        <Polyline
          key={`leg-${i}`}
          coordinates={leg.coords}
          strokeColor={leg.color}
          strokeWidth={leg.isWalking ? 4 : 6}
          lineCap="round"
          lineJoin="round"
          lineDashPattern={leg.isWalking ? [4, 8] : undefined}
          zIndex={1}
        />
      ))}
      {route?.markers.map((marker, i) => (
        <TrackedMarker key={`waypoint-${i}`} coordinate={marker.coord} anchor={{ x: 0.5, y: 0.5 }}>
          <RouteWaypoint />
        </TrackedMarker>
      ))}
      {coords && (
        <UserLocationMarker
          latitude={coords.latitude}
          longitude={coords.longitude}
          heading={heading}
        />
      )}
      {focusedStation && (
        <TrackedMarker
          coordinate={{ latitude: focusedStation.lat, longitude: focusedStation.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
          trackKey={roundelScale}
        >
          <StationRoundel scale={roundelScale} />
        </TrackedMarker>
      )}
    </MapView>
  )
})

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
})
