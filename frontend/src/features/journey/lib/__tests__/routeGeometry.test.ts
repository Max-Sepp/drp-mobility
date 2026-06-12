import { describe, expect, it, vi } from 'vitest'
import { journeyToRouteGeometry } from '@/features/journey/lib/routeGeometry'
import type { Journey, Leg } from '@/features/journey/api/tfl'

// routeGeometry imports legLineColor from legDisplay.tsx, which pulls in React Native /
// Tamagui / Expo for its visual exports. Mock those so Vitest (node env) can load the module;
// legLineColor itself only reads the static LINE_COLORS table. Mirrors fareLabel.test.ts.
vi.mock('tamagui', () => ({ Text: null, XStack: null }))
vi.mock('@expo/vector-icons', () => ({ MaterialIcons: null }))
vi.mock('@/theme', () => ({ useTheme: () => ({}), Borders: {}, Opacity: {} }))
vi.mock('@/lib/MobilityStyleContext', () => ({
  useMobilityStyle: () => ({}),
  stablePickIndex: () => 0,
}))

const COLORS = { fallback: '#007AFF', walk: '#999999' }

function leg(partial: Partial<Leg>): Leg {
  return {
    duration: 5,
    mode: { name: 'tube' },
    instruction: { summary: '' },
    ...partial,
  } as Leg
}

function journey(legs: Leg[]): Journey {
  return { startDateTime: '', arrivalDateTime: '', duration: 0, legs }
}

describe('journeyToRouteGeometry', () => {
  it('parses lineString [lat, lng] pairs into {latitude, longitude}', () => {
    const j = journey([
      leg({
        mode: { name: 'victoria' },
        path: { lineString: JSON.stringify([[51.5, -0.1], [51.51, -0.12]]) },
      }),
    ])
    const geo = journeyToRouteGeometry(j, COLORS)
    expect(geo.legs).toHaveLength(1)
    expect(geo.legs[0].coords).toEqual([
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.51, longitude: -0.12 },
    ])
    expect(geo.legs[0].isWalking).toBe(false)
    expect(geo.bounds).toHaveLength(2)
  })

  it('flags walking legs and uses the walk colour', () => {
    const j = journey([
      leg({
        mode: { name: 'walking' },
        path: { lineString: JSON.stringify([[51.5, -0.1], [51.501, -0.101]]) },
      }),
    ])
    const geo = journeyToRouteGeometry(j, COLORS)
    expect(geo.legs[0].isWalking).toBe(true)
    expect(geo.legs[0].color).toBe(COLORS.walk)
  })

  it('falls back to a straight departure→arrival segment when lineString is absent', () => {
    const j = journey([
      leg({
        departurePoint: { lat: 51.5, lon: -0.1 },
        arrivalPoint: { lat: 51.52, lon: -0.13 },
      }),
    ])
    const geo = journeyToRouteGeometry(j, COLORS)
    expect(geo.legs[0].coords).toEqual([
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.52, longitude: -0.13 },
    ])
  })

  it('skips legs with no usable geometry', () => {
    const j = journey([leg({})])
    expect(journeyToRouteGeometry(j, COLORS).legs).toHaveLength(0)
  })

  it('marks start, end, and interchanges from transit-leg endpoints', () => {
    const j = journey([
      leg({ mode: { name: 'walking' }, path: { lineString: JSON.stringify([[51.49, -0.1], [51.5, -0.1]]) } }),
      leg({
        mode: { name: 'victoria' },
        departurePoint: { lat: 51.5, lon: -0.1 },
        arrivalPoint: { lat: 51.53, lon: -0.12 },
        path: { lineString: JSON.stringify([[51.5, -0.1], [51.53, -0.12]]) },
      }),
      leg({
        mode: { name: 'northern' },
        departurePoint: { lat: 51.53, lon: -0.12 },
        arrivalPoint: { lat: 51.55, lon: -0.14 },
        path: { lineString: JSON.stringify([[51.53, -0.12], [51.55, -0.14]]) },
      }),
    ])
    const geo = journeyToRouteGeometry(j, COLORS)
    expect(geo.markers).toEqual([
      { coord: { latitude: 51.5, longitude: -0.1 }, kind: 'start' },
      { coord: { latitude: 51.53, longitude: -0.12 }, kind: 'interchange' },
      { coord: { latitude: 51.55, longitude: -0.14 }, kind: 'end' },
    ])
  })
})
