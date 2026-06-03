import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack } from 'tamagui'
import type { ResolvedLocation } from '../api/geocode'
import type { Journey, RouteTag } from '../api/tfl'

export type ResolveStation = (commonName: string) => string | null
export type StationPressHandler = (stationName: string) => void

const TAG_LABELS: Record<RouteTag, string> = {
  fastest: 'Fastest',
  'fewest-changes': 'Fewest changes',
  'least-walking': 'Least walking',
}

/** Pill chips labelling why a route stands out (e.g. "Fastest", "Least walking"). */
export function RouteTags({ tags }: { tags?: RouteTag[] }) {
  if (!tags || tags.length === 0) return null
  return (
    <XStack flexWrap="wrap" gap="$1.5">
      {tags.map((tag) => (
        <XStack
          key={tag}
          px="$2"
          py="$1"
          style={{
            backgroundColor: '#eff6ff',
            borderColor: '#bfdbfe',
            borderWidth: 1,
            borderRadius: 999,
          }}
        >
          <Text fontSize={11} fontWeight="700" color="#1d4ed8">
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
                color="#9ca3af"
                aria-label="to"
              />
            )}
            {resolved ? (
              <Text
                fontSize={13}
                fontWeight="600"
                color="#2563eb"
                pressStyle={{ opacity: 0.6 }}
                onPress={() => onStationPress(resolved)}
                role="button"
                aria-label={`View accessibility for ${resolved}`}
                style={{ textDecorationLine: 'underline' }}
              >
                {resolved}
              </Text>
            ) : (
              <Text fontSize={13} color="#6b7280">
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
 */
export function fareLabel(journey: Journey): string | null {
  const { fare, legs } = journey
  if (fare && fare.totalCost > 0) return `£${(fare.totalCost / 100).toFixed(2)}`
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

/** "Victoria: lift, escalator reported out of service" for each affected station. */
export function outageWarning(
  outages: { stationName: string; equipmentTypes: string[] }[],
): string {
  return outages
    .map((o) => `${o.stationName}: ${o.equipmentTypes.join(', ')} reported out of service`)
    .join(' · ')
}
