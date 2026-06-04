import type { Journey } from '@/features/journey/api/tfl'

export type RailcardCode =
  | 'YNG' // 16-25 Railcard
  | 'Y30' // 26-30 Railcard
  | 'SRN' // Senior Railcard (60+)
  | '2TR' // Two Together Railcard
  | 'FAM' // Family & Friends Railcard
  | 'DIS' // Disabled Persons Railcard
  | 'HMF' // HM Forces Railcard
  | 'NGC' // Network Railcard

export type Railcard = {
  code: RailcardCode
  name: string
  description: string
}

export const RAILCARDS: Railcard[] = [
  { code: 'YNG', name: '16-25 Railcard', description: '1/3 off rail fares' },
  { code: 'Y30', name: '26-30 Railcard', description: '1/3 off rail fares' },
  { code: 'SRN', name: 'Senior Railcard', description: '1/3 off rail fares (60+)' },
  { code: '2TR', name: 'Two Together Railcard', description: '1/3 off when travelling with one other' },
  { code: 'FAM', name: 'Family & Friends Railcard', description: '1/3 off adult rail fares' },
  { code: 'DIS', name: 'Disabled Persons Railcard', description: '1/3 off rail fares' },
  { code: 'HMF', name: 'HM Forces Railcard', description: '1/3 off rail fares' },
  { code: 'NGC', name: 'Network Railcard', description: '1/3 off off-peak rail fares in Network SE' },
]

const DISCOUNT = 1 / 3

// Modes where a railcard gives no discount. Bus and tram are pay-as-you-go Oyster/contactless
// only; railcards apply to rail-based services.
const NO_DISCOUNT_MODES = new Set(['bus', 'tram'])

/**
 * Returns true if the railcard discount is applicable to this journey. Railcards do not apply
 * to bus-only journeys (every ticketed non-walking leg is a bus or tram).
 */
export function railcardApplies(journey: Journey): boolean {
  const ticketed = journey.legs.filter((l) => l.mode.name !== 'walking')
  if (ticketed.length === 0) return false
  return ticketed.some((l) => !NO_DISCOUNT_MODES.has(l.mode.name))
}

/**
 * Apply a railcard discount to a fare in pence. Returns the discounted amount rounded down to
 * the nearest penny — consistent with how Oyster rounds discounts.
 */
export function applyRailcardDiscount(pence: number): number {
  return Math.floor(pence * (1 - DISCOUNT))
}

export function findRailcard(code: string | null | undefined): Railcard | null {
  if (!code) return null
  return RAILCARDS.find((r) => r.code === code) ?? null
}
