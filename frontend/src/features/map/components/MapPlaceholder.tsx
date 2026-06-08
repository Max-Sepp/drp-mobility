// Map placeholder component.
// Replace the body of this component with MapBox GL / react-native-maps
// when integrating a real map. The props interface is intentionally minimal
// so the swap is a single-component change.

import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTheme } from '@/theme'

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

const GRID_COLS = 6
const GRID_ROWS = 10

type StylesType = ReturnType<typeof makeStyles>

function GridLines({ styles }: { styles: StylesType }) {
  return (
    <>
      {Array.from({ length: GRID_ROWS - 1 }).map((_, i) => (
        <View
          key={`h${i}`}
          style={[
            styles.gridLine,
            styles.horizontal,
            { top: `${((i + 1) / GRID_ROWS) * 100}%` as any },
          ]}
        />
      ))}
      {Array.from({ length: GRID_COLS - 1 }).map((_, i) => (
        <View
          key={`v${i}`}
          style={[
            styles.gridLine,
            styles.vertical,
            { left: `${((i + 1) / GRID_COLS) * 100}%` as any },
          ]}
        />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Location pin
// ---------------------------------------------------------------------------

function LocationPin({ styles }: { styles: StylesType }) {
  return (
    <View style={styles.pinContainer}>
      <View style={styles.pinOuter}>
        <View style={styles.pinInner} />
      </View>
      <View style={styles.pinShadowEllipse} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MapPlaceholder() {
  const { Colors } = useTheme()
  const styles = useMemo(() => makeStyles(Colors), [Colors])
  return (
    <View style={styles.container}>
      <GridLines styles={styles} />
      {/* Faint road-like horizontal band across the middle */}
      <View style={styles.roadH} />
      <View style={styles.roadV} />
      <LocationPin styles={styles} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function makeStyles(Colors: { mapBg: string; mapGrid: string; blue: string }) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.mapBg,
      overflow: 'hidden',
    },
    gridLine: {
      position: 'absolute',
      backgroundColor: Colors.mapGrid,
    },
    horizontal: {
      left: 0,
      right: 0,
      height: StyleSheet.hairlineWidth,
    },
    vertical: {
      top: 0,
      bottom: 0,
      width: StyleSheet.hairlineWidth,
    },
    roadH: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: '48%',
      height: 6,
      backgroundColor: '#E8EAD4',
    },
    roadV: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '33%',
      width: 5,
      backgroundColor: '#E8EAD4',
    },
    pinContainer: {
      position: 'absolute',
      top: '44%',
      left: '50%',
      transform: [{ translateX: -18 }, { translateY: -18 }],
      alignItems: 'center',
    },
    pinOuter: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: Colors.blue,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: '#FFFFFF',
      boxShadow: '0px 2px 4px rgba(0,0,0,0.25)',
      elevation: 4,
    },
    pinInner: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: '#FFFFFF',
    },
    pinShadowEllipse: {
      width: 16,
      height: 6,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.15)',
      marginTop: 2,
    },
  })
}
