import { StyleSheet, View } from 'react-native'

const TUBE_LINES = new Set([
  'Bakerloo',
  'Central',
  'Circle',
  'District',
  'Hammersmith & City',
  'Jubilee',
  'Metropolitan',
  'Northern',
  'Piccadilly',
  'Victoria',
  'Waterloo & City',
])

function resolveColor(lines: string[]): string {
  const s = new Set(lines)
  if (s.has('Elizabeth')) return '#6950A1'
  if (s.has('London Overground') || s.has('Overground')) return '#EE7C0E'
  if (s.has('DLR')) return '#00A4A7'
  if (s.has('National Rail')) return '#1C3F6E'
  if (lines.some((l) => TUBE_LINES.has(l))) return '#E32017'
  return '#8E8E93'
}

type Props = { lines: string[] }

export function StationMarker({ lines }: Props) {
  const color = resolveColor(lines)
  return (
    <View style={[styles.circle, { backgroundColor: color }]}>
      <View style={styles.bar} />
    </View>
  )
}

const styles = StyleSheet.create({
  circle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#003688',
  },
})
