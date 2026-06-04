import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Marker } from 'react-native-maps'
import { Colors, Shadows } from '@/theme'

type Props = {
  latitude: number
  longitude: number
  heading: number | null
}

// How long to keep redrawing the marker bitmap after its content changes.
const TRACK_DURATION_MS = 500

export function UserLocationMarker({ latitude, longitude, heading }: Props) {
  // react-native-maps redraws the marker bitmap on every render while
  // tracksViewChanges is true, which makes a custom marker flicker. Keep it on
  // only briefly after the rendered content changes, then switch it off so the
  // marker stays static between updates.
  const [tracksViewChanges, setTracksViewChanges] = useState(true)

  useEffect(() => {
    setTracksViewChanges(true)
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_DURATION_MS)
    return () => clearTimeout(timer)
  }, [latitude, longitude, heading])

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      flat
    >
      <View style={styles.container}>
        {/* Directional cone — only shown when heading is available */}
        {heading !== null && (
          <View style={[styles.coneWrapper, { transform: [{ rotate: `${heading}deg` }] }]}>
            <View style={styles.cone} />
          </View>
        )}
        {/* User dot */}
        <View style={styles.dot}>
          <View style={styles.dotInner} />
        </View>
      </View>
    </Marker>
  )
}

const DOT_SIZE = 18
const CONE_SIZE = 44

const styles = StyleSheet.create({
  container: {
    width: CONE_SIZE,
    height: CONE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coneWrapper: {
    position: 'absolute',
    width: CONE_SIZE,
    height: CONE_SIZE,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  // Triangle pointing upward (north before rotation)
  cone: {
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 18,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: `${Colors.blue}55`, // 33% opacity
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: Colors.blue,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.marker,
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
})
