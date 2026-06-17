import { useEffect, useMemo, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import { Marker } from 'react-native-maps'
import { useTheme } from '@/theme'

type Props = {
  latitude: number
  longitude: number
  heading: number | null
}

// The directional cone is only drawn on Android. The cone has to rotate with the heading, and the
// two providers handle that very differently:
//   • Android (Google Maps): the Marker `rotation` prop rotates the captured bitmap natively, so the
//     cone follows the heading without ever re-capturing the bitmap — no flicker.
//   • iOS (Apple Maps): AIRMapMarker ignores `rotation` entirely, so the only way to rotate the cone
//     is to re-render its child view and re-capture the bitmap. Every such re-capture makes the
//     marker flash at the map origin (0,0) for a frame (AIRMapMarker.reactSetFrame re-centres the
//     view from its React-layout frame before MapView repositions it). There is no way around that
//     on Apple Maps, so iOS shows the dot only — captured once, never re-captured, never flashing.
const SHOW_CONE = Platform.OS === 'android'

// How long to keep tracksViewChanges=true after the marker bitmap content changes,
// long enough for the native side to capture a non-empty bitmap before freezing it.
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

  // Re-capturing the marker bitmap (while tracksViewChanges=true) makes react-native-maps briefly
  // draw the marker at the map origin (0,0) before snapping it back to its coordinate — a visible
  // flash. Heading rotation is applied natively via the Marker `rotation` prop (no bitmap touch on
  // Android), so the rendered content only ever changes when the cone appears/disappears. We
  // re-capture on mount and on that toggle, never per heading update.
  const showCone = SHOW_CONE && heading !== null
  const [tracksViewChanges, setTracksViewChanges] = useState(true)

  useEffect(() => {
    setTracksViewChanges(true)
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_DURATION_MS)
    return () => clearTimeout(timer)
  }, [showCone])

  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      rotation={showCone ? (heading ?? 0) : 0}
      tracksViewChanges={tracksViewChanges}
      flat
    >
      <View style={styles.container}>
        {showCone && (
          <View style={styles.coneWrapper}>
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
