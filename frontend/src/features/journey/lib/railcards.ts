import type { Journey } from '@/features/journey/api/tfl'

// ---------------------------------------------------------------------------
// Traveller types (TfL Oyster card concession categories)
// ---------------------------------------------------------------------------

export type TravellerTypeCode =
  | 'adult'
  | 'railcard_holder'
  | 'apprentice'
  | 'student_18plus'
  | '16plus'
  | '11_15'
  | '5_10'
  | 'jobcentre'
  | 'disabled'
  | 'veterans'

export type TravellerType = {
  code: TravellerTypeCode
  name: string
  description: string
  discount: number // fraction off total PAYG fare (0 = no discount, 0.5 = half price)
  railcardOnly?: boolean // true = discount only applies when railcardApplies(journey) is true
}

export const TRAVELLER_TYPES: TravellerType[] = [
  { code: 'adult', name: 'Adult', description: 'Standard adult fare', discount: 0 },
  {
    code: 'railcard_holder',
    name: 'Railcard Holder',
    description:
      '1/3 off Tube, Overground, National Rail, DLR & Elizabeth line fares. Requires a valid railcard (e.g. 16-25, Senior) linked to your Oyster card. Does not apply to buses or trams.',
    discount: 1 / 3,
    railcardOnly: true,
  },
  {
    code: 'apprentice',
    name: 'Apprentice',
    description: '50% off adult pay-as-you-go fares',
    discount: 0.5,
  },
  {
    code: 'student_18plus',
    name: '18+ Student',
    description: 'No discount on pay-as-you-go fares',
    discount: 0,
  },
  {
    code: '16plus',
    name: '16+',
    description: '50% off Tube & rail, free bus & tram',
    discount: 0.5,
  },
  {
    code: '11_15',
    name: '11–15',
    description: '50% off Tube & rail, free bus & tram',
    discount: 0.5,
  },
  { code: '5_10', name: '5–10', description: 'Free travel on all TfL services', discount: 1 },
  {
    code: 'jobcentre',
    name: 'Jobcentre Plus',
    description: '50% off adult pay-as-you-go fares',
    discount: 0.5,
  },
  {
    code: 'disabled',
    name: 'Disabled Persons Railcard',
    description: '1/3 off fares (Oyster registered)',
    discount: 1 / 3,
  },
  {
    code: 'veterans',
    name: 'Veterans',
    description: 'Free travel on all TfL services',
    discount: 1,
  },
]

// ---------------------------------------------------------------------------
// National Rail railcards
// ---------------------------------------------------------------------------

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

// All National Rail railcards give 1/3 off eligible rail fares.
const RAILCARD_DISCOUNT = 1 / 3

export const RAILCARDS: Railcard[] = [
  { code: 'YNG', name: '16-25 Railcard', description: '1/3 off rail fares' },
  { code: 'Y30', name: '26-30 Railcard', description: '1/3 off rail fares' },
  { code: 'SRN', name: 'Senior Railcard (60+)', description: '1/3 off rail fares' },
  {
    code: '2TR',
    name: 'Two Together Railcard',
    description: '1/3 off when travelling with one other',
  },
  { code: 'FAM', name: 'Family & Friends Railcard', description: '1/3 off adult rail fares' },
  { code: 'DIS', name: 'Disabled Persons Railcard', description: '1/3 off rail fares' },
  { code: 'HMF', name: 'HM Forces Railcard', description: '1/3 off rail fares' },
  {
    code: 'NGC',
    name: 'Network Railcard',
    description: '1/3 off off-peak rail fares in Network SE',
  },
]

// ---------------------------------------------------------------------------
// Discount calculation
// ---------------------------------------------------------------------------

// Modes where railcards give no discount (bus and tram are Oyster/contactless only).
const NO_RAILCARD_MODES = new Set(['bus', 'tram'])

/**
 * Returns true if a railcard discount is applicable to this journey — i.e. at least one
 * ticketed, non-walking leg is not a bus or tram.
 */
export function railcardApplies(journey: Journey): boolean {
  const ticketed = journey.legs.filter((l) => l.mode.name !== 'walking')
  if (ticketed.length === 0) return false
  return ticketed.some((l) => !NO_RAILCARD_MODES.has(l.mode.name))
}

/**
 * The effective discount fraction for a journey, given the user's traveller type and railcard.
 * We take the greater of the two discounts — they cannot be stacked.
 * Railcard discount is only considered when the journey has eligible (non-bus) rail legs.
 */
export function effectiveDiscount(
  journey: Journey,
  travellerType: string | null | undefined,
  railcard: string | null | undefined,
): number {
  const tt = TRAVELLER_TYPES.find((t) => t.code === travellerType)
  const rawTd = tt?.discount ?? 0
  const td = tt?.railcardOnly ? (railcardApplies(journey) ? rawTd : 0) : rawTd
  const hasRailcard = railcard ? RAILCARDS.some((r) => r.code === railcard) : false
  const rd = hasRailcard && railcardApplies(journey) ? RAILCARD_DISCOUNT : 0
  return Math.max(td, rd)
}

export function findTravellerType(code: string | null | undefined): TravellerType | null {
  if (!code) return null
  return TRAVELLER_TYPES.find((t) => t.code === code) ?? null
}

export function findRailcard(code: string | null | undefined): Railcard | null {
  if (!code) return null
  return RAILCARDS.find((r) => r.code === code) ?? null
}
