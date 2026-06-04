import { describe, expect, it } from 'vitest'
import {
  effectiveDiscount,
  findRailcard,
  findTravellerType,
  railcardApplies,
} from '../railcards'
import type { Journey } from '@/features/journey/api/tfl'

// ---------------------------------------------------------------------------
// Minimal journey factories
// ---------------------------------------------------------------------------

function makeJourney(modes: string[], fareP = 300): Journey {
  return {
    startDateTime: '2025-01-01T09:00:00',
    arrivalDateTime: '2025-01-01T09:30:00',
    duration: 30,
    fare: { totalCost: fareP },
    legs: modes.map((name) => ({
      duration: 10,
      mode: { name },
      instruction: { summary: `Take the ${name}` },
    })),
  }
}

const railJourney      = makeJourney(['tube'])
const busJourney       = makeJourney(['bus'])
const tramJourney      = makeJourney(['tram'])
const walkJourney      = { ...makeJourney(['walking']), fare: undefined }
const mixedRailBus     = makeJourney(['tube', 'bus'])
const mixedTramRail    = makeJourney(['tram', 'national-rail'])
const nationalRail     = makeJourney(['national-rail'])
const elizabethLine    = makeJourney(['elizabeth-line'])
const overground       = makeJourney(['overground'])

// ---------------------------------------------------------------------------
// railcardApplies
// ---------------------------------------------------------------------------

describe('railcardApplies', () => {
  it('returns true for a tube journey', () => {
    expect(railcardApplies(railJourney)).toBe(true)
  })

  it('returns true for a national-rail journey', () => {
    expect(railcardApplies(nationalRail)).toBe(true)
  })

  it('returns true for an Elizabeth line journey', () => {
    expect(railcardApplies(elizabethLine)).toBe(true)
  })

  it('returns true for an Overground journey', () => {
    expect(railcardApplies(overground)).toBe(true)
  })

  it('returns true for a mixed tube+bus journey (rail leg is present)', () => {
    expect(railcardApplies(mixedRailBus)).toBe(true)
  })

  it('returns true for a mixed tram+national-rail journey (rail leg is present)', () => {
    expect(railcardApplies(mixedTramRail)).toBe(true)
  })

  it('returns false for a bus-only journey', () => {
    expect(railcardApplies(busJourney)).toBe(false)
  })

  it('returns false for a tram-only journey', () => {
    expect(railcardApplies(tramJourney)).toBe(false)
  })

  it('returns false for a walking-only journey', () => {
    expect(railcardApplies(walkJourney as Journey)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// effectiveDiscount
// ---------------------------------------------------------------------------

describe('effectiveDiscount', () => {
  it('adult with no railcard → 0', () => {
    expect(effectiveDiscount(railJourney, 'adult', null)).toBe(0)
  })

  it('adult with a railcard on a rail journey → 1/3', () => {
    expect(effectiveDiscount(railJourney, 'adult', 'YNG')).toBeCloseTo(1 / 3)
  })

  it('railcard does not apply on a bus-only journey → 0', () => {
    expect(effectiveDiscount(busJourney, 'adult', 'YNG')).toBe(0)
  })

  it('18+ student with no railcard → 0 (no PAYG discount)', () => {
    expect(effectiveDiscount(railJourney, 'student_18plus', null)).toBe(0)
  })

  it('18+ student with a railcard on a rail journey → 1/3 (railcard beats 0%)', () => {
    expect(effectiveDiscount(railJourney, 'student_18plus', 'YNG')).toBeCloseTo(1 / 3)
  })

  it('apprentice (50%) + railcard (1/3) → 50% (traveller type wins)', () => {
    expect(effectiveDiscount(railJourney, 'apprentice', 'YNG')).toBe(0.5)
  })

  it('jobcentre (50%) + railcard (1/3) → 50%', () => {
    expect(effectiveDiscount(railJourney, 'jobcentre', 'YNG')).toBe(0.5)
  })

  it('16+ (50%) with no railcard → 50%', () => {
    expect(effectiveDiscount(railJourney, '16plus', null)).toBe(0.5)
  })

  it('11-15 (50%) with no railcard → 50%', () => {
    expect(effectiveDiscount(railJourney, '11_15', null)).toBe(0.5)
  })

  it('5-10 → 100% (free)', () => {
    expect(effectiveDiscount(railJourney, '5_10', null)).toBe(1)
  })

  it('veterans → 100% (free)', () => {
    expect(effectiveDiscount(railJourney, 'veterans', null)).toBe(1)
  })

  it('disabled traveller type (1/3) + DIS railcard (1/3) → 1/3', () => {
    expect(effectiveDiscount(railJourney, 'disabled', 'DIS')).toBeCloseTo(1 / 3)
  })

  it('railcard does not apply on a tram-only journey → 0', () => {
    expect(effectiveDiscount(tramJourney, 'adult', 'YNG')).toBe(0)
  })

  it('traveller type discount DOES apply on a bus-only journey (Oyster concessions work on buses)', () => {
    expect(effectiveDiscount(busJourney, 'apprentice', null)).toBe(0.5)
  })

  it('traveller type discount applies on a tram-only journey', () => {
    expect(effectiveDiscount(tramJourney, 'apprentice', null)).toBe(0.5)
  })

  it('5-10 is free on a bus journey (traveller type, not railcard)', () => {
    expect(effectiveDiscount(busJourney, '5_10', null)).toBe(1)
  })

  it('veterans are free on a bus journey', () => {
    expect(effectiveDiscount(busJourney, 'veterans', null)).toBe(1)
  })

  it('railcard applies on mixed tram+rail journey because rail leg is present', () => {
    expect(effectiveDiscount(mixedTramRail, 'adult', 'YNG')).toBeCloseTo(1 / 3)
  })

  it('unknown traveller type → 0', () => {
    expect(effectiveDiscount(railJourney, 'unknown_type', null)).toBe(0)
  })

  it('unknown railcard code → 0', () => {
    expect(effectiveDiscount(railJourney, 'adult', 'FAKE')).toBe(0)
  })

  it('null traveller type and null railcard → 0', () => {
    expect(effectiveDiscount(railJourney, null, null)).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

describe('findRailcard', () => {
  it('finds a valid railcard', () => {
    expect(findRailcard('YNG')?.name).toBe('16-25 Railcard')
  })

  it('returns null for unknown code', () => {
    expect(findRailcard('FAKE')).toBeNull()
  })

  it('returns null for null input', () => {
    expect(findRailcard(null)).toBeNull()
  })
})

describe('findTravellerType', () => {
  it('finds adult', () => {
    expect(findTravellerType('adult')?.name).toBe('Adult')
  })

  it('finds veterans', () => {
    expect(findTravellerType('veterans')?.name).toBe('Veterans')
  })

  it('finds 5-10', () => {
    expect(findTravellerType('5_10')?.discount).toBe(1)
  })

  it('returns null for unknown code', () => {
    expect(findTravellerType('ghost')).toBeNull()
  })
})
