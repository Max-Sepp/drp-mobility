import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Dimensions, StyleSheet } from 'react-native'
import MapView, { PoiClickEvent, Region } from 'react-native-maps'
import { fuzzyScore } from '@/lib/fuzzy'
import { useAppHeading, useAppLocation } from '@/lib/LocationContext'
import stationMarkers from '@/features/map/data/stationMarkers.json'
import { UserLocationMarker } from '@/features/map/components/UserLocationMarker'

export type StationMapHandle = { recentre: () => void }

// Bottom padding keeps the camera centre in the visible map area above the sheet.
// Matches the mid-snap height defined in SearchActionSheet (SCREEN_H * 0.5).
const SHEET_BOTTOM_INSET = Dimensions.get('window').height * 0.5

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

type Props = { onStationPress: (name: string) => void }

export const StationMap = forwardRef<StationMapHandle, Props>(function StationMap(
  { onStationPress },
  ref,
) {
  const coords = useAppLocation()
  const heading = useAppHeading()
  const mapRef = useRef<MapView>(null)

  function animateToUser() {
    if (!coords) return
    mapRef.current?.animateToRegion(
      { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      600,
    )
  }

  useImperativeHandle(ref, () => ({ recentre: animateToUser }))

  // Animate to user location the first time coords become available.
  const centredRef = useRef(false)
  useEffect(() => {
    if (coords && !centredRef.current) {
      centredRef.current = true
      animateToUser()
    }
  }, [coords])

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
      mapPadding={{ top: 0, right: 0, left: 0, bottom: SHEET_BOTTOM_INSET }}
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
    </MapView>
  )
})

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
})
