import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Marker } from 'react-native-maps'
import { useTheme } from '@/theme'

type Props = {
  latitude: number
  longitude: number
  heading: number | null
}

// How long to keep tracksViewChanges=true after heading changes.
// Must be shorter than the heading throttle interval in LocationContext (300ms)
// so the timer can fire between consecutive heading state updates.
const TRACK_DURATION_MS = 250

const DOT_SIZE = 18
const CONE_SIZE = 44

export function UserLocationMarker({ latitude, longitude, heading }: Props) {
  const { Colors, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
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
        cone: {
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderLeftWidth: 9,
          borderRightWidth: 9,
          borderBottomWidth: 18,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: `${Colors.blue}55`,
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
      }),
    [Colors, Shadows],
  )

  // tracksViewChanges=true tells react-native-maps to regenerate the marker bitmap.
  // Only heading changes need a bitmap refresh (cone rotation). Coordinate changes
  // move the pin natively via the coordinate prop without touching the bitmap.
  const [tracksViewChanges, setTracksViewChanges] = useState(true)

  useEffect(() => {
    setTracksViewChanges(true)
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_DURATION_MS)
    return () => clearTimeout(timer)
  }, [heading])

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={tracksViewChanges}
      flat
    >
      <View style={styles.container}>
        {heading !== null && (
          <View style={[styles.coneWrapper, { transform: [{ rotate: `${heading}deg` }] }]}>
            <View style={styles.cone} />
          </View>
        )}
        <View style={styles.dot}>
          <View style={styles.dotInner} />
        </View>
      </View>
    </Marker>
  )
}
