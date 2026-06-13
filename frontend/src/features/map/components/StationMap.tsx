import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Marker, Polyline, PoiClickEvent, Region } from 'react-native-maps'
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

  // Frame the whole route, leaving room for the top buttons and the sheet covering the bottom.
  const fitToRoute = useCallback(
    (coords: LatLng[]) => {
      if (coords.length === 0) return
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 60, left: 60, bottom: bottomInset + 60 },
        animated: true,
      })
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

  // The route's destination, surfaced as a TfL roundel above the white "end" dot so the rider can
  // always spot where the trip finishes. It lives on the route overlay, so it appears whenever a
  // route is shown (preview or active journey) and clears automatically when the route does.
  const destination = route?.markers.find((m) => m.kind === 'end') ?? null

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
          strokeWidth={6}
          lineCap="round"
          lineJoin="round"
          lineDashPattern={leg.isWalking ? [4, 8] : undefined}
          zIndex={1}
        />
      ))}
      {route?.markers.map((marker, i) => (
        <Marker
          key={`waypoint-${i}`}
          coordinate={marker.coord}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <RouteWaypoint />
        </Marker>
      ))}
      {destination && (
        <Marker
          coordinate={destination.coord}
          // Centre anchor matches the focused-station roundel marker; an out-of-range anchor
          // makes react-native-maps fall back to its default pin instead of the custom view.
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <StationRoundel scale={roundelScale} />
        </Marker>
      )}
      {coords && (
        <UserLocationMarker
          latitude={coords.latitude}
          longitude={coords.longitude}
          heading={heading}
        />
      )}
      {focusedStation && (
        <Marker
          coordinate={{ latitude: focusedStation.lat, longitude: focusedStation.lng }}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <StationRoundel scale={roundelScale} />
        </Marker>
      )}
    </MapView>
  )
})

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
})
