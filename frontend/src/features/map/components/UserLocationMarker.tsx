import { StyleSheet, View } from 'react-native'
import { Marker } from 'react-native-maps'
import { Colors } from '@/theme'

type Props = {
  latitude: number
  longitude: number
  heading: number | null
}

export function UserLocationMarker({ latitude, longitude, heading }: Props) {
  return (
    <Marker
      coordinate={{ latitude, longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges
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
    boxShadow: '0px 1px 4px rgba(0,0,0,0.3)',
    elevation: 4,
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
})
