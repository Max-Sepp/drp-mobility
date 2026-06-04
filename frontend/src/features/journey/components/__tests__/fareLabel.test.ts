import { describe, expect, it, vi } from 'vitest'
import { fareLabel } from '@/features/journey/components/legDisplay'
import type { Journey } from '@/features/journey/api/tfl'

// legDisplay.tsx imports React Native / Tamagui / Expo components for its visual
// exports. Mock them so Vitest (node environment) can load the module without
// a native runtime — fareLabel itself uses none of these. vi.mock is hoisted
// above the imports by Vitest, so the mocks apply even though they appear below.
vi.mock('tamagui', () => ({ Text: null, XStack: null }))
vi.mock('@expo/vector-icons', () => ({ MaterialIcons: null }))
vi.mock('@/theme', () => ({
  Borders: {},
  Colors: { blue: '#007AFF', secondaryText: '#8E8E93', warningBg: '', warningBorder: '', warningDark: '' },
  Opacity: { pressed: 0.7 },
  Radii: {},
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJourney(modes: string[], fareP?: number): Journey {
  return {
    startDateTime: '2025-01-01T09:00:00',
    arrivalDateTime: '2025-01-01T09:30:00',
    duration: 30,
    ...(fareP !== undefined ? { fare: { totalCost: fareP } } : {}),
    legs: modes.map((name) => ({
      duration: 10,
      mode: { name },
      instruction: { summary: `Take the ${name}` },
    })),
  }
}

// ---------------------------------------------------------------------------
// fareLabel
// ---------------------------------------------------------------------------

describe('fareLabel', () => {
  it('returns null when there is no fare and the journey is not walking-only', () => {
    expect(fareLabel(makeJourney(['tube']))).toBeNull()
  })

  it('returns "Free" for a walking-only journey with no fare', () => {
    expect(fareLabel(makeJourney(['walking']))).toBe('Free')
  })

  it('formats the full adult fare correctly', () => {
    expect(fareLabel(makeJourney(['tube'], 310), 'adult', null)).toBe('£3.10')
  })

  it('applies 1/3 railcard discount on a rail journey (floors to nearest penny)', () => {
    // £3.00 * 2/3 = £2.00 exactly
    expect(fareLabel(makeJourney(['tube'], 300), 'adult', 'YNG')).toBe('£2.00')
    // £3.10 * 2/3 = 206.6… → floors to 206p = £2.06
    expect(fareLabel(makeJourney(['tube'], 310), 'adult', 'YNG')).toBe('£2.06')
  })

  it('does not apply a railcard discount on a bus-only journey', () => {
    expect(fareLabel(makeJourney(['bus'], 300), 'adult', 'YNG')).toBe('£3.00')
  })

  it('applies 50% discount for apprentice traveller type', () => {
    expect(fareLabel(makeJourney(['tube'], 300), 'apprentice', null)).toBe('£1.50')
  })

  it('uses traveller type discount when it beats the railcard (50% > 1/3)', () => {
    expect(fareLabel(makeJourney(['tube'], 300), 'apprentice', 'YNG')).toBe('£1.50')
  })

  it('uses railcard discount when it beats the traveller type (1/3 > 0% for 18+ student)', () => {
    expect(fareLabel(makeJourney(['tube'], 300), 'student_18plus', 'YNG')).toBe('£2.00')
  })

  it('returns "Free" for 5-10 traveller type (100% discount)', () => {
    expect(fareLabel(makeJourney(['tube'], 300), '5_10', null)).toBe('Free')
  })

  it('returns "Free" for veterans (100% discount)', () => {
    expect(fareLabel(makeJourney(['tube'], 300), 'veterans', null)).toBe('Free')
  })

  it('returns "Free" for a discounted journey that costs £0', () => {
    expect(fareLabel(makeJourney(['tube'], 100), 'veterans', null)).toBe('Free')
  })

  it('returns null when fare is zero (TfL omitted it) for a non-walking journey', () => {
    expect(fareLabel(makeJourney(['tube'], 0), 'adult', null)).toBeNull()
  })

  it('handles undefined travellerType and railcard gracefully (no discount)', () => {
    expect(fareLabel(makeJourney(['tube'], 300))).toBe('£3.00')
  })

  it('traveller type discount applies on a bus-only journey (Oyster concessions work on buses)', () => {
    expect(fareLabel(makeJourney(['bus'], 300), 'apprentice', null)).toBe('£1.50')
  })

  it('railcard is ignored on a bus-only journey even when traveller type is adult', () => {
    expect(fareLabel(makeJourney(['bus'], 300), 'adult', 'YNG')).toBe('£3.00')
  })

  it('traveller type discount applies on a tram-only journey', () => {
    expect(fareLabel(makeJourney(['tram'], 300), 'jobcentre', null)).toBe('£1.50')
  })

  it('railcard is ignored on a tram-only journey', () => {
    expect(fareLabel(makeJourney(['tram'], 300), 'adult', 'SRN')).toBe('£3.00')
  })

  it('5-10 is free on a bus journey (via traveller type, not railcard)', () => {
    expect(fareLabel(makeJourney(['bus'], 300), '5_10', null)).toBe('Free')
  })

  it('veterans are free on a bus journey', () => {
    expect(fareLabel(makeJourney(['bus'], 300), 'veterans', null)).toBe('Free')
  })

  it('railcard applies on a mixed tube+bus journey (rail leg present)', () => {
    expect(fareLabel(makeJourney(['tube', 'bus'], 300), 'adult', 'YNG')).toBe('£2.00')
  })
})
