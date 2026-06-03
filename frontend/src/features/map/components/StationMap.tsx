import Mapbox from '@rnmapbox/maps'
import { useState } from 'react'
import { StyleSheet } from 'react-native'
import { useAppLocation } from '@/lib/LocationContext'
import stationMarkers from '../data/stationMarkers.json'
import { StationMarker } from './StationMarker'

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '')

const LONDON_CENTER: [number, number] = [-0.1276, 51.5074]
const DEFAULT_ZOOM = 13

// [[ne_lng, ne_lat], [sw_lng, sw_lat]]
type Bounds = [[number, number], [number, number]]

type Props = { onStationPress: (name: string) => void }

export function StationMap({ onStationPress }: Props) {
  const coords = useAppLocation()
  const [bounds, setBounds] = useState<Bounds | null>(null)

  const centerCoordinate: [number, number] = coords
    ? [coords.longitude, coords.latitude]
    : LONDON_CENTER

  const visibleStations = bounds
    ? stationMarkers.filter(
        (m) =>
          m.lat <= bounds[0][1] &&
          m.lat >= bounds[1][1] &&
          m.lng <= bounds[0][0] &&
          m.lng >= bounds[1][0],
      )
    : []

  function handleRegionChange(feature: GeoJSON.Feature) {
    const vb = feature?.properties?.visibleBounds as Bounds | undefined
    if (vb) setBounds(vb)
  }

  return (
    <Mapbox.MapView
      style={styles.map}
      styleURL="mapbox://styles/mapbox/light-v11"
      onRegionDidChange={handleRegionChange}
    >
      <Mapbox.Camera
        defaultSettings={{
          centerCoordinate,
          zoomLevel: DEFAULT_ZOOM,
        }}
      />
      <Mapbox.UserLocation visible />
      {visibleStations.map((station) => (
        <Mapbox.PointAnnotation
          key={station.name}
          id={station.name}
          coordinate={[station.lng, station.lat]}
          onSelected={() => onStationPress(station.name)}
        >
          <StationMarker lines={station.lines} />
        </Mapbox.PointAnnotation>
      ))}
    </Mapbox.MapView>
  )
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
})
