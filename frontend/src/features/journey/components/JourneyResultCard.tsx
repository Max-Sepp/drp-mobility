import { Text, XStack, YStack } from 'tamagui'
import type { Journey } from '../api/tfl'

type JourneyResultCardProps = {
  journey: Journey
}

/** A human-readable label for a TfL mode name, e.g. `national-rail` -> `National rail`. */
function modeLabel(name: string): string {
  const cleaned = name.replace(/-/g, ' ')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
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
 * One journey option: total duration, depart/arrive times, and the ordered legs.
 * Mode is shown as text (no colour-only signals, per the project UI rules).
 */
export const JourneyResultCard = ({ journey }: JourneyResultCardProps) => {
  const fare = fareLabel(journey)
  return (
    <YStack
      mx="$5"
      mt="$4"
      p="$4"
      gap="$3"
      style={{ borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: 'white' }}
    >
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
          <XStack key={i} gap="$2.5" items="flex-start">
            <Text fontSize={13} fontWeight="700" color="#2563eb" style={{ width: 88 }}>
              {modeLabel(leg.mode.name)}
            </Text>
            <YStack flex={1} gap="$0.5">
              <Text fontSize={14} color="#111827">{leg.instruction.summary}</Text>
              <Text fontSize={12} color="#6b7280">{leg.duration} min</Text>
            </YStack>
          </XStack>
        ))}
      </YStack>
    </YStack>
  )
}
