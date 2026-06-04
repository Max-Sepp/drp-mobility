import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { Journey, RouteTag } from '@/features/journey/api/tfl'
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
} from '@/features/journey/components/legDisplay'
import { useAuth } from '@/features/auth'
import { Borders, Colors, Opacity, Radii } from '@/theme'

type JourneyResultCardProps = {
  journey: Journey
  outages?: StationOutage[]
  tags?: RouteTag[]
  from?: ResolvedLocation
  to?: ResolvedLocation
  resolveStation: ResolveStation
  onStationPress: StationPressHandler
  onPress?: () => void
}

/**
 * A single journey option: headline duration/fare/times, a per-leg breakdown, and a banner
 * for any step-free outages along the route. Passing `onPress` turns the whole card into a
 * tappable button (with a "View details" affordance); omit it for a static, read-only card.
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
  const { user } = useAuth()
  const fare = fareLabel(journey, user?.traveller_type, user?.railcard)
  // TfL's total duration includes interchange/platform waiting that the legs don't account for;
  // the leftover after summing the legs is the time spent waiting and connecting.
  const legTotal = journey.legs.reduce((sum, leg) => sum + leg.duration, 0)
  const waiting = journey.duration - legTotal
  return (
    <YStack
      mx="$5"
      mt="$4"
      p="$4"
      gap="$3"
      pressStyle={onPress ? { opacity: Opacity.pressed } : undefined}
      onPress={onPress}
      role={onPress ? 'button' : undefined}
      aria-label={onPress ? 'View journey details' : undefined}
      style={{
        borderWidth: Borders.medium,
        borderColor: Colors.border,
        borderRadius: Radii.button,
        backgroundColor: Colors.card,
      }}
    >
      {/* Step-free outage warning — surfaced first so riders see access risks before the route. */}
      {outages.length > 0 && (
        <XStack
          gap="$2"
          p="$2.5"
          items="flex-start"
          style={{
            backgroundColor: Colors.warningBg,
            borderWidth: Borders.thin,
            borderColor: Colors.warningBorder,
            borderRadius: Radii.small,
          }}
        >
          <Text fontSize={15}>⚠️</Text>
          <Text fontSize={13} color={Colors.warningDark} flex={1}>
            {outageWarning(outages)}
          </Text>
        </XStack>
      )}

      <RouteTags tags={tags} />

      <XStack items="center" justify="space-between">
        <XStack items="baseline" gap="$2">
          <Text fontSize={18} fontWeight="700" color={Colors.text}>
            {journey.duration} min
          </Text>
          {fare && (
            <Text fontSize={15} fontWeight="600" color={Colors.success}>
              {fare}
            </Text>
          )}
        </XStack>
        <Text fontSize={15} color={Colors.text}>
          {clockTime(journey.startDateTime)} → {clockTime(journey.arrivalDateTime)}
        </Text>
      </XStack>

      <YStack gap="$2.5">
        {journey.legs.map((leg, i) => (
          <XStack key={i} gap="$3" items="flex-start">
            <MaterialIcons
              name={modeIcon(leg.mode.name)}
              size={22}
              color={Colors.blue}
              aria-label={modeLabel(leg.mode.name)}
              style={{ width: 24, marginTop: 1 }}
            />
            <YStack flex={1} gap="$0.5">
              <Text fontSize={14} color={Colors.text}>
                {humanizeSummary(leg.instruction.summary, [from, to])}
              </Text>
              <LegStations
                leg={leg}
                resolveStation={resolveStation}
                onStationPress={onStationPress}
              />
              <Text fontSize={12} color={Colors.secondaryText}>
                {leg.duration} min
              </Text>
            </YStack>
          </XStack>
        ))}

        {/* Only show the waiting row when it rounds to at least a minute. */}
        {waiting >= 1 && (
          <XStack gap="$3" items="flex-start">
            <MaterialIcons
              name="schedule"
              size={22}
              color={Colors.secondaryText}
              aria-label="Waiting and connections"
              style={{ width: 24, marginTop: 1 }}
            />
            <YStack flex={1} gap="$0.5">
              <Text fontSize={14} color={Colors.secondaryText}>
                Waiting & connections
              </Text>
              <Text fontSize={12} color={Colors.secondaryText}>
                {waiting} min
              </Text>
            </YStack>
          </XStack>
        )}
      </YStack>

      {onPress && (
        <XStack items="center" justify="flex-end" gap="$1">
          <Text fontSize={13} fontWeight="600" color={Colors.blue}>
            View details
          </Text>
          <MaterialIcons name="chevron-right" size={18} color={Colors.blue} />
        </XStack>
      )}
    </YStack>
  )
}
