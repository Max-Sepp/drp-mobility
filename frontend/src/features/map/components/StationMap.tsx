import { useState } from 'react'
import { StyleSheet } from 'react-native'
import MapView, { Marker, Region } from 'react-native-maps'
import { useAppLocation } from '@/lib/LocationContext'
import stationMarkers from '../data/stationMarkers.json'
import { StationMarker } from './StationMarker'

const LONDON: Region = {
  latitude: 51.5074,
  longitude: -0.1276,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
}

type Props = { onStationPress: (name: string) => void }

export function StationMap({ onStationPress }: Props) {
  const coords = useAppLocation()
  const [region, setRegion] = useState<Region | null>(null)

  const initialRegion: Region = coords
    ? { latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : LONDON

  const visibleStations = region
    ? stationMarkers.filter(
        (m) =>
          m.lat >= region.latitude - region.latitudeDelta / 2 &&
          m.lat <= region.latitude + region.latitudeDelta / 2 &&
          m.lng >= region.longitude - region.longitudeDelta / 2 &&
          m.lng <= region.longitude + region.longitudeDelta / 2,
      )
    : []

  return (
    <MapView
      style={styles.map}
      initialRegion={initialRegion}
      onRegionChangeComplete={setRegion}
      showsUserLocation
      showsMyLocationButton={false}
    >
      {visibleStations.map((station) => (
        <Marker
          key={station.name}
          coordinate={{ latitude: station.lat, longitude: station.lng }}
          onPress={() => onStationPress(station.name)}
          tracksViewChanges={false}
        >
          <StationMarker lines={station.lines} />
        </Marker>
      ))}
    </MapView>
  )
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
})
