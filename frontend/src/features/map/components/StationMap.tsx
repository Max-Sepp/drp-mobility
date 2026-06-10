import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import MapView, { Marker, PoiClickEvent, Region } from 'react-native-maps'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { fuzzyScore } from '@/lib/fuzzy'
import { useAppHeading, useAppLocation } from '@/lib/LocationContext'
import stationMarkers from '@/features/map/data/stationMarkers.json'
import { UserLocationMarker } from '@/features/map/components/UserLocationMarker'

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

type Props = { onStationPress: (name: string) => void; bottomInset: number }

export const StationMap = forwardRef<StationMapHandle, Props>(function StationMap(
  { onStationPress, bottomInset },
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
    // mapPadding is already set to the station sheet height by the time this runs
    // (MapHomeScreen.openStation updates stationHeight before calling focusStation),
    // so a single immediate animation centres correctly in the visible area.
    mapRef.current?.animateToRegion(
      { latitude: station.lat, longitude: station.lng, latitudeDelta: LAT_DELTA, longitudeDelta: LAT_DELTA },
      600,
    )
  }, [])

  const clearFocus = useCallback(() => setFocusedStation(null), [])

  useImperativeHandle(ref, () => ({ recentre: animateToUser, focusStation, clearFocus }), [
    animateToUser,
    focusStation,
    clearFocus,
  ])

  // Animate to user location the first time coords become available.
  const centredRef = useRef(false)
  useEffect(() => {
    if (coords && !centredRef.current) {
      centredRef.current = true
      animateToUser()
    }
  }, [coords, animateToUser])

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
