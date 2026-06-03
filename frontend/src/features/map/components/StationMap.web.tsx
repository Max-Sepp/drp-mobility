// Web stub — @rnmapbox/maps is native-only and the app has no web target.
// This file is picked up automatically by Metro when bundling for web,
// preventing a 500 from the dev server when opened in a browser.
import { MapPlaceholder } from './MapPlaceholder'

export function StationMap({ onStationPress: _ }: { onStationPress: (name: string) => void }) {
  return <MapPlaceholder />
}
