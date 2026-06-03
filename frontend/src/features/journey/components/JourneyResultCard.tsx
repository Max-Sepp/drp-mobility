import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import type { StationOutage } from '../api/accessibility'
import type { ResolvedLocation } from '../api/geocode'
import type { Journey, RouteTag } from '../api/tfl'
import {
  clockTime,
  fareLabel,
  humanizeSummary,
  LegStations,
  modeIcon,
  modeLabel,
  outageWarning,
  type ResolveStation,
  RouteTags,
  type StationPressHandler,
} from './legDisplay'

type JourneyResultCardProps = {
  journey: Journey
  /** Stations on this journey we know to have broken step-free equipment, if any. */
  outages?: StationOutage[]
  /** Why this route stands out (fastest / fewest changes / least walking). */
  tags?: RouteTag[]
  // The resolved start/end the journey was planned between. Used to swap the bare postcodes
  // TfL echoes in its leg instructions back to the readable places the user chose.
  from?: ResolvedLocation
  to?: ResolvedLocation
  // Maps a TfL station `commonName` to a station we have a detail screen for (or null), and
  // opens that screen. Together these make the stations on a leg tappable.
  resolveStation: ResolveStation
  onStationPress: StationPressHandler
  /** Opens the expanded journey detail screen for this journey. */
  onPress?: () => void
}

/**
 * One journey option: total duration, depart/arrive times, and the ordered legs, each shown
 * with a mode icon. Per-leg durations cover only time in motion, so any remaining time (the
 * total minus the legs) is interchange and waiting — shown as its own line so the breakdown
 * visibly adds up to the headline duration. Tapping the card opens the expanded detail view.
 */
export const JourneyResultCard = ({
  journey,
  outages = [],
  tags,
  from,
  to,
  resolveStation,
  onStationPress,
  onPress,
}: JourneyResultCardProps) => {
  const fare = fareLabel(journey)
  const legTotal = journey.legs.reduce((sum, leg) => sum + leg.duration, 0)
  const waiting = journey.duration - legTotal
  return (
    <YStack
      mx="$5"
      mt="$4"
      p="$4"
      gap="$3"
      pressStyle={onPress ? { opacity: 0.7 } : undefined}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? 'View journey details' : undefined}
      style={{
        borderWidth: 1.5,
        borderColor: '#d1d5db',
        borderRadius: 10,
        backgroundColor: 'white',
      }}
    >
      {outages.length > 0 && (
        <XStack
          gap="$2"
          p="$2.5"
          items="flex-start"
          style={{
            backgroundColor: '#fffbeb',
            borderWidth: 1,
            borderColor: '#fcd34d',
            borderRadius: 8,
          }}
        >
          <Text fontSize={15}>⚠️</Text>
          <Text fontSize={13} color="#92400e" flex={1}>
            {outageWarning(outages)}
          </Text>
        </XStack>
      )}

      <RouteTags tags={tags} />

      <XStack items="center" justify="space-between">
        <XStack items="baseline" gap="$2">
          <Text fontSize={18} fontWeight="700" color="#111827">
            {journey.duration} min
          </Text>
          {fare && (
            <Text fontSize={15} fontWeight="600" color="#16a34a">
              {fare}
            </Text>
          )}
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
              <Text fontSize={14} color="#111827">
                {humanizeSummary(leg.instruction.summary, [from, to])}
              </Text>
              <LegStations
                leg={leg}
                resolveStation={resolveStation}
                onStationPress={onStationPress}
              />
              <Text fontSize={12} color="#6b7280">
                {leg.duration} min
              </Text>
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
              <Text fontSize={14} color="#6b7280">
                Waiting & connections
              </Text>
              <Text fontSize={12} color="#6b7280">
                {waiting} min
              </Text>
            </YStack>
          </XStack>
        )}
      </YStack>

      {onPress && (
        <XStack items="center" justify="flex-end" gap="$1">
          <Text fontSize={13} fontWeight="600" color="#2563eb">
            View details
          </Text>
          <MaterialIcons name="chevron-right" size={18} color="#2563eb" />
        </XStack>
      )}
    </YStack>
  )
}
