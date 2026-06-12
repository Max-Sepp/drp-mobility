import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Marker, Polyline, PoiClickEvent, Region } from 'react-native-maps'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { fuzzyScore } from '@/lib/fuzzy'
import { useAppHeading, useAppLocation } from '@/lib/LocationContext'
import stationMarkers from '@/features/map/data/stationMarkers.json'
import { UserLocationMarker } from '@/features/map/components/UserLocationMarker'
import type { LatLng, RouteGeometry, RouteMarker } from '@/features/journey/lib/routeGeometry'

type StationMarkerEntry = (typeof stationMarkers)[number]

// Rendered from Underground.svg (viewBox 615.3×500). The bar extends beyond the circle
// on both sides (authentic roundel look), so the rendered width is wider than height.
function StationRoundel() {
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
      <Svg width={55} height={45} viewBox="0 0 615.3 500">
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

// A waypoint dot drawn at a route's start / end / interchange. Start and end are filled with the
// adjoining line colour; interchanges are white-filled with a coloured ring so changes stand out.
function RouteWaypoint({ kind }: { kind: RouteMarker['kind'] }) {
  const size = kind === 'interchange' ? 16 : 14
  return (
    <Svg width={size} height={size}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={size / 2 - 2}
        fill={kind === 'interchange' ? 'white' : '#1f1f1f'}
        stroke={kind === 'interchange' ? '#1f1f1f' : 'white'}
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
          <RouteWaypoint kind={marker.kind} />
        </Marker>
      ))}
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
          <StationRoundel />
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
