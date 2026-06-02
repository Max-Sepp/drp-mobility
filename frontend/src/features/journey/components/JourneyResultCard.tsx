import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import type { StationOutage } from '../api/accessibility'
import type { ResolvedLocation } from '../api/geocode'
import type { Journey } from '../api/tfl'

type JourneyResultCardProps = {
  journey: Journey
  /** Stations on this journey we know to have broken step-free equipment, if any. */
  outages?: StationOutage[]
  // The resolved start/end the journey was planned between. Used to swap the bare postcodes
  // TfL echoes in its leg instructions back to the readable places the user chose.
  from?: ResolvedLocation
  to?: ResolvedLocation
}

/** "Victoria: lift, escalator reported out of service" for each affected station. */
function outageWarning(outages: StationOutage[]): string {
  return outages
    .map(o => `${o.stationName}: ${o.equipmentTypes.join(', ')} reported out of service`)
    .join(' · ')
}

/** A human-readable label for a TfL mode name, e.g. `national-rail` -> `National rail`. */
function modeLabel(name: string): string {
  const cleaned = name.replace(/-/g, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/** A MaterialIcons glyph for a TfL mode name, falling back to a generic transit icon. */
function modeIcon(name: string): keyof typeof MaterialIcons.glyphMap {
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
function clockTime(local: string): string {
  const match = local.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : local
}

/**
 * The fare to display, or null to show nothing. TfL's fare data is unreliable — it's often
 * omitted even for ticketed journeys — so we only say "Free" when the journey is genuinely
 * walking-only. A paid journey with missing fare data returns null (we show nothing) rather
 * than a misleading "Free".
 */
function fareLabel(journey: Journey): string | null {
  const { fare, legs } = journey
  if (fare && fare.totalCost > 0) return `£${(fare.totalCost / 100).toFixed(2)}`
  const walkingOnly = legs.length > 0 && legs.every(leg => leg.mode.name === 'walking')
  if (walkingOnly) return 'Free'
  return null
}

/**
 * Replace the postcodes we sent to TfL with the readable places the user chose. We query
 * postcode-to-postcode (to avoid TfL's "did you mean?" disambiguation), so TfL's instructions
 * say e.g. "Walk to SW1A 1AA" — we rewrite that to "Walk to Buckingham Palace". The match is
 * space-insensitive because TfL may format the postcode differently from how we sent it.
 */
function humanizeSummary(summary: string, locations: (ResolvedLocation | undefined)[]): string {
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
 * One journey option: total duration, depart/arrive times, and the ordered legs, each shown
 * with a mode icon. Per-leg durations cover only time in motion, so any remaining time (the
 * total minus the legs) is interchange and waiting — shown as its own line so the breakdown
 * visibly adds up to the headline duration.
 */
export const JourneyResultCard = ({ journey, outages = [], from, to }: JourneyResultCardProps) => {
  const fare = fareLabel(journey)
  const legTotal = journey.legs.reduce((sum, leg) => sum + leg.duration, 0)
  const waiting = journey.duration - legTotal
  return (
    <YStack
      mx="$5"
      mt="$4"
      p="$4"
      gap="$3"
      style={{ borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: 'white' }}
    >
      {outages.length > 0 && (
        <XStack
          gap="$2"
          p="$2.5"
          items="flex-start"
          style={{ backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', borderRadius: 8 }}
        >
          <Text fontSize={15}>⚠️</Text>
          <Text fontSize={13} color="#92400e" flex={1}>{outageWarning(outages)}</Text>
        </XStack>
      )}

      <XStack items="center" justify="space-between">
        <XStack items="baseline" gap="$2">
          <Text fontSize={18} fontWeight="700" color="#111827">{journey.duration} min</Text>
          {fare && <Text fontSize={15} fontWeight="600" color="#16a34a">{fare}</Text>}
        </XStack>
        <Text fontSize={15} color="#374151">
          {clockTime(journey.startDateTime)} → {clockTime(journey.arrivalDateTime)}
        </Text>
      </XStack>

      <YStack gap="$2.5">
        {journey.legs.map((leg, i) => (
          <XStack key={i} gap="$3" items="flex-start">
            <MaterialIcons
              name={modeIcon(leg.mode.name)}
              size={22}
              color="#2563eb"
              accessibilityLabel={modeLabel(leg.mode.name)}
              style={{ width: 24, marginTop: 1 }}
            />
            <YStack flex={1} gap="$0.5">
              <Text fontSize={14} color="#111827">{humanizeSummary(leg.instruction.summary, [from, to])}</Text>
              <Text fontSize={12} color="#6b7280">{leg.duration} min</Text>
            </YStack>
          </XStack>
        ))}

        {waiting >= 1 && (
          <XStack gap="$3" items="flex-start">
            <MaterialIcons
              name="schedule"
              size={22}
              color="#6b7280"
              accessibilityLabel="Waiting and connections"
              style={{ width: 24, marginTop: 1 }}
            />
            <YStack flex={1} gap="$0.5">
              <Text fontSize={14} color="#6b7280">Waiting & connections</Text>
              <Text fontSize={12} color="#6b7280">{waiting} min</Text>
            </YStack>
          </XStack>
        )}
      </YStack>
    </YStack>
  )
}
