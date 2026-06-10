import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack } from 'tamagui'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { Journey, Leg, RouteTag } from '@/features/journey/api/tfl'
import { effectiveDiscount } from '@/features/journey/lib/railcards'
import { useTheme, Borders, Opacity } from '@/theme'

export type ResolveStation = (commonName: string) => string | null
export type StationPressHandler = (stationName: string) => void

const TAG_LABELS: Record<RouteTag, string> = {
  fastest: 'Fastest',
  'fewest-changes': 'Fewest changes',
  'least-walking': 'Least walking',
}

/** Pill chips labelling why a route stands out (e.g. "Fastest", "Least walking"). */
export function RouteTags({ tags }: { tags?: RouteTag[] }) {
  const { Colors, Radii } = useTheme()
  if (!tags || tags.length === 0) return null
  return (
    <XStack flexWrap="wrap" gap="$1.5">
      {tags.map((tag) => (
        <XStack
          key={tag}
          px="$2"
          py="$1"
          style={{
            backgroundColor: Colors.blueBg,
            borderColor: Colors.border,
            borderWidth: Borders.thin,
            borderRadius: Radii.pill,
          }}
        >
          <Text fontSize={11} fontWeight="700" color={Colors.blue}>
            {TAG_LABELS[tag]}
          </Text>
        </XStack>
      ))}
    </XStack>
  )
}

/** Drop the "… Underground/Rail/DLR/Bus Station" suffix TfL appends, preserving case for display. */
export function stripStationSuffix(name: string): string {
  return name.replace(/\s+(?:underground|rail|dlr|bus)?\s*station$/i, '').trim()
}

/** The line a leg runs on with its direction, e.g. "Victoria towards Brixton", or null. */
export function lineLabel(leg: Leg): string | null {
  const option = leg.routeOptions?.[0]
  if (!option?.name) return null
  const direction = option.directions?.find(Boolean)
  return direction ? `${option.name} towards ${stripStationSuffix(direction)}` : option.name
}

// Modes whose stops are train stations we hold accessibility data for. Bus/coach stops, river
// piers, walking, etc. are deliberately excluded — their "points" aren't stations we can link to.
export const STATION_MODES = new Set([
  'tube',
  'dlr',
  'overground',
  'national-rail',
  'elizabeth-line',
  'tflrail',
])

/**
 * The departure and arrival stations of a train leg, each a tappable link through to the
 * station-detail screen when we recognise it. Non-train legs (bus, walking, …) and legs without
 * named points render nothing.
 */
export function LegStations({
  leg,
  resolveStation,
  onStationPress,
}: {
  leg: Journey['legs'][number]
  resolveStation: ResolveStation
  onStationPress: StationPressHandler
}) {
  const { Colors } = useTheme()
  if (!STATION_MODES.has(leg.mode.name)) return null
  const points = [leg.departurePoint?.commonName, leg.arrivalPoint?.commonName].filter(
    (n): n is string => !!n,
  )
  if (points.length === 0) return null

  return (
    <XStack flexWrap="wrap" items="center" gap="$1.5" mt="$0.5">
      {points.map((commonName, i) => {
        const resolved = resolveStation(commonName)
        return (
          <XStack key={i} items="center" gap="$1.5">
            {i > 0 && (
              <MaterialIcons
                name="arrow-forward"
                size={13}
                color={Colors.tertiaryText}
                aria-label="to"
              />
            )}
            {resolved ? (
              <Text
                fontSize={13}
                fontWeight="600"
                color={Colors.blue}
                pressStyle={{ opacity: Opacity.disabledMid }}
                onPress={() => onStationPress(resolved)}
                role="button"
                aria-label={`View accessibility for ${resolved}`}
                style={{ textDecorationLine: 'underline' }}
              >
                {resolved}
              </Text>
            ) : (
              <Text fontSize={13} color={Colors.secondaryText}>
                {stripStationSuffix(commonName)}
              </Text>
            )}
          </XStack>
        )
      })}
    </XStack>
  )
}

/** A human-readable label for a TfL mode name, e.g. `national-rail` -> `National rail`. */
export function modeLabel(name: string): string {
  const cleaned = name.replace(/-/g, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** A MaterialIcons glyph for a TfL mode name, falling back to a generic transit icon. */
export function modeIcon(name: string): keyof typeof MaterialIcons.glyphMap {
  switch (name) {
    case 'walking':
      return 'directions-walk'
    case 'bus':
    case 'coach':
      return 'directions-bus'
    case 'tube':
      return 'directions-subway'
    case 'dlr':
    case 'overground':
    case 'national-rail':
    case 'elizabeth-line':
    case 'tflrail':
      return 'directions-railway'
    case 'tram':
      return 'tram'
    case 'river-bus':
    case 'river-tour':
      return 'directions-boat'
    case 'cycle':
    case 'cycle-hire':
      return 'directions-bike'
    default:
      return 'directions-transit'
  }
}

/**
 * TfL returns local London wall-clock times without a timezone (e.g.
 * "2026-06-01T14:37:00"), so read the HH:MM straight off the string. Converting via the
 * backend `parseUtc`/`formatTime` helpers would wrongly treat it as UTC and shift it by
 * the device's offset.
 */
export function clockTime(local: string): string {
  const match = local.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : local
}

/**
 * The fare to display, or null to show nothing. TfL's fare data is unreliable — it's often
 * omitted even for ticketed journeys — so we only say "Free" when the journey is genuinely
 * walking-only. A paid journey with missing fare data returns null (we show nothing) rather
 * than a misleading "Free".
 *
 * Pass a railcard code to apply the standard 1/3 discount where applicable. Railcards do not
 * apply to bus-only journeys.
 */
export function fareLabel(
  journey: Journey,
  travellerType?: string | null,
  railcard?: string | null,
): string | null {
  const { fare, legs } = journey
  if (fare && fare.totalCost > 0) {
    const discount = effectiveDiscount(journey, travellerType, railcard)
    const cost = Math.floor(fare.totalCost * (1 - discount))
    if (cost === 0) return 'Free'
    return `£${(cost / 100).toFixed(2)}`
  }
  const walkingOnly = legs.length > 0 && legs.every((leg) => leg.mode.name === 'walking')
  if (walkingOnly) return 'Free'
  return null
}

/**
 * Replace the postcodes we sent to TfL with the readable places the user chose. We query
 * postcode-to-postcode (to avoid TfL's "did you mean?" disambiguation), so TfL's instructions
 * say e.g. "Walk to SW1A 1AA" — we rewrite that to "Walk to Buckingham Palace". The match is
 * space-insensitive because TfL may format the postcode differently from how we sent it.
 */
export function humanizeSummary(
  summary: string,
  locations: (ResolvedLocation | undefined)[],
): string {
  let out = summary
  for (const loc of locations) {
    if (!loc || loc.label === loc.postcode) continue
    const compact = loc.postcode.replace(/\s+/g, '')
    const pattern = `${compact.slice(0, -3)}\\s*${compact.slice(-3)}`
    out = out.replace(new RegExp(pattern, 'ig'), loc.label)
  }
  return out
}

/**
 * True when every lift on the user's journey path at a station is broken. Uses journey-relevant
 * counts when available (populated by assessOutages), falls back to station-level total.
 */
export function allLiftsDown(outage: {
  units: { equipmentType: string }[]
  totalByType: Record<string, number>
  journeyRelevantLifts?: { broken: number; total: number }
}): boolean {
  if (outage.journeyRelevantLifts) {
    const { broken, total } = outage.journeyRelevantLifts
    return broken > 0 && total > 0 && broken >= total
  }
  const brokenLifts = outage.units.filter((u) => u.equipmentType === 'lift').length
  const totalLifts = outage.totalByType['lift'] ?? brokenLifts
  return brokenLifts > 0 && brokenLifts >= totalLifts
}

/**
 * True when any station on the journey has all its lifts down, meaning step-free
 * access is completely blocked there.
 */
export function anyStationAllLiftsDown(
  outages: { units: { equipmentType: string }[]; totalByType: Record<string, number> }[],
): boolean {
  return outages.some(allLiftsDown)
}

/** "Paddington: 3/7 lifts on your route broken" for each affected station. */
export function outageWarning(
  outages: {
    stationName: string
    equipmentTypes: string[]
    units: { equipmentType: string }[]
    totalByType: Record<string, number>
    journeyRelevantLifts?: { broken: number; total: number }
  }[],
): string {
  return outages
    .map((o) => {
      let liftPart: string | null = null
      if (o.journeyRelevantLifts && o.journeyRelevantLifts.broken > 0) {
        const { broken, total } = o.journeyRelevantLifts
        liftPart =
          total > 1
            ? `${broken}/${total} lifts on your route broken`
            : 'lift on your route broken'
      } else {
        const brokenLifts = o.units.filter((u) => u.equipmentType === 'lift').length
        const totalLifts = o.totalByType['lift'] ?? 0
        liftPart =
          brokenLifts > 0 && totalLifts > 1
            ? `${brokenLifts}/${totalLifts} lifts broken`
            : brokenLifts > 0
              ? 'lift reported out of service'
              : null
      }
      const otherTypes = o.equipmentTypes
        .filter((t) => t !== 'lift')
        .map((t) => `${t} reported out of service`)
      const parts = [liftPart, ...otherTypes].filter(Boolean)
      return `${o.stationName}: ${parts.join(', ')}`
    })
    .join(' · ')
}

// ---------------------------------------------------------------------------
// Line colours, walking theming, mode chips — shared across result card and detail view
// ---------------------------------------------------------------------------

/** TfL corporate line colours keyed by lowercase line name. */
export const LINE_COLORS: Record<string, string> = {
  bakerloo: '#894E24',
  central: '#DC241F',
  circle: '#FFD329',
  district: '#007229',
  'hammersmith & city': '#F3A9BB',
  jubilee: '#A0A5A9',
  metropolitan: '#9B0056',
  northern: '#000000',
  piccadilly: '#003688',
  victoria: '#0098D4',
  'waterloo & city': '#95CDBA',
  'elizabeth line': '#6950A1',
  dlr: '#00AFAD',
  overground: '#EE7C0E',
}

/** Label shown for walking legs in route summaries — change here to rebrand (e.g. for wheelchair theming). */
export const WALKING_LABEL = 'Walk'
/** Icon used for walking legs — swap for a wheelchair or custom glyph. */
export const WALKING_ICON: keyof typeof MaterialIcons.glyphMap = 'directions-walk'

/** Returns the TfL line colour for a transit leg, or a fallback blue. */
export function legLineColor(leg: Leg, fallback = '#007AFF'): string {
  const name = leg.routeOptions?.[0]?.name?.toLowerCase() ?? ''
  return LINE_COLORS[name] ?? fallback
}

function LegChip({ leg, compact = true }: { leg: Leg; compact?: boolean }) {
  const { Colors, Radii } = useTheme()
  const icon = modeIcon(leg.mode.name)
  const isWalking = leg.mode.name === 'walking'
  const isBus = leg.mode.name === 'bus' || leg.mode.name === 'coach'
  const routeName = leg.routeOptions?.[0]?.name
  if (isWalking) {
    // Apple Maps-style: walk glyph + duration in a gray bubble.
    const mins = `${Math.max(1, Math.round(leg.duration))} min`
    return (
      <XStack
        items="center"
        gap={compact ? 3 : 4}
        px={compact ? 6 : 9}
        py={compact ? 2 : 4}
        style={{ backgroundColor: Colors.searchBg, borderRadius: Radii.pill }}
        aria-label={`${WALKING_LABEL} ${mins}`}
      >
        <MaterialIcons name={WALKING_ICON} size={compact ? 14 : 18} color={Colors.secondaryText} />
        <Text fontSize={compact ? 11 : 13} fontWeight="600" color={Colors.secondaryText}>
          {mins}
        </Text>
      </XStack>
    )
  }
  const badgeColor = isBus
    ? Colors.searchBg
    : (LINE_COLORS[routeName?.toLowerCase() ?? ''] ?? Colors.blue)
  return (
    <XStack items="center" gap={compact ? 3 : 5}>
      <MaterialIcons name={icon} size={compact ? 15 : 18} color={Colors.secondaryText} />
      {routeName && (
        <XStack
          px={compact ? 5 : 8}
          py={compact ? 1 : 3}
          style={{
            backgroundColor: badgeColor,
            borderRadius: 4,
            borderWidth: isBus ? Borders.thin : 0,
            borderColor: isBus ? Colors.border : undefined,
          }}
        >
          <Text fontSize={compact ? 10 : 13} fontWeight="700" color={isBus ? Colors.text : 'white'}>
            {routeName}
          </Text>
        </XStack>
      )}
    </XStack>
  )
}

/**
 * Chevron-separated summary of all legs: walk icon → bus badge → tube icon → etc.
 * `compact` (default true) uses smaller icons and badges suitable for list cards.
 * Pass `compact={false}` for the larger version used in the detail view header.
 */
export function ModePipe({ legs, compact = true }: { legs: Leg[]; compact?: boolean }) {
  const { Colors } = useTheme()
  return (
    <XStack flexWrap="wrap" items="center">
      {legs.map((leg, i) => (
        <XStack key={i} items="center">
          {i > 0 && (
            <MaterialIcons
              name="chevron-right"
              size={compact ? 13 : 16}
              color={Colors.tertiaryText}
              style={{ marginHorizontal: compact ? 2 : 4 }}
            />
          )}
          <LegChip leg={leg} compact={compact} />
        </XStack>
      ))}
    </XStack>
  )
}
