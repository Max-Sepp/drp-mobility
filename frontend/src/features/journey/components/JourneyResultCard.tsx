import { Text, XStack, YStack } from 'tamagui'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { Journey, RouteTag } from '@/features/journey/api/tfl'
import {
  anyStationAllLiftsDown,
  clockTime,
  fareLabel,
  ModePipe,
  outageWarning,
  RouteTags,
} from '@/features/journey/components/legDisplay'
import { useAuth } from '@/features/auth'
import { useTheme, Borders, Opacity } from '@/theme'

type JourneyResultCardProps = {
  journey: Journey
  outages?: StationOutage[]
  tags?: RouteTag[]
  from?: ResolvedLocation
  to?: ResolvedLocation
  resolveStation?: (name: string) => string | null
  onStationPress?: (station: string) => void
  onPress?: () => void
}

export const JourneyResultCard = ({
  journey,
  outages = [],
  tags,
  onPress,
}: JourneyResultCardProps) => {
  const { Colors, Radii } = useTheme()
  const { user } = useAuth()
  const fare = fareLabel(journey, user?.traveller_type, user?.railcard)
  const critical = anyStationAllLiftsDown(outages)

  return (
    <YStack
      mx="$4"
      mt="$3"
      pressStyle={onPress ? { opacity: Opacity.pressed } : undefined}
      onPress={onPress}
      role={onPress ? 'button' : undefined}
      aria-label={onPress ? 'View journey details' : undefined}
      style={{
        borderWidth: Borders.medium,
        borderColor: Colors.border,
        borderRadius: Radii.card,
        backgroundColor: Colors.card,
        overflow: 'hidden',
      }}
    >
      {outages.length > 0 && (
        <XStack
          gap="$2"
          px="$3"
          py="$2"
          items="flex-start"
          style={{
            backgroundColor: critical ? Colors.dangerBg : Colors.warningBg,
            borderBottomWidth: Borders.thin,
            borderBottomColor: critical ? Colors.dangerBorder : Colors.warningBorder,
          }}
        >
          <Text fontSize={13}>⚠️</Text>
          <Text fontSize={12} color={critical ? Colors.dangerDark : Colors.warningDark} flex={1}>
            {outageWarning(outages)}
          </Text>
        </XStack>
      )}

      <YStack px="$3" pt="$2.5" pb="$3" gap="$2">
        <RouteTags tags={tags} />

        <XStack gap="$3" items="center">
          <YStack items="center" justify="center" style={{ width: 54 }}>
            <Text fontSize={30} fontWeight="800" color={Colors.text} style={{ lineHeight: 34 }}>
              {journey.duration}
            </Text>
            <Text fontSize={11} fontWeight="600" color={Colors.secondaryText}>
              min
            </Text>
          </YStack>

          <YStack flex={1} gap="$1.5">
            <XStack justify="space-between" items="center">
              <Text fontSize={13} color={Colors.secondaryText}>
                {clockTime(journey.startDateTime)} – {clockTime(journey.arrivalDateTime)}
              </Text>
              {fare && (
                <Text fontSize={13} fontWeight="700" color={Colors.success}>
                  {fare}
                </Text>
              )}
            </XStack>
            <ModePipe legs={journey.legs} />
          </YStack>
        </XStack>
      </YStack>
    </YStack>
  )
}
