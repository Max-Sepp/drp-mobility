import { MaterialIcons } from '@expo/vector-icons'
import { StyleSheet, TouchableOpacity } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import type { OutageAssessment, StationRole } from '@/features/journey/api/outageRelevance'
import type { Journey, RouteTag, TaggedJourney } from '@/features/journey/api/tfl'
import { JourneyResultCard } from '@/features/journey/components/JourneyResultCard'
import { useTheme, Borders, Spacing } from '@/theme'

export type RerouteState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'found'; alternatives: TaggedJourney[] }
  | { phase: 'none-found' }

type Props = {
  blockedAssessments: OutageAssessment[]
  rerouteState: RerouteState
  onFindAlternative: () => void
  onSelectAlternative: (journey: Journey, tags: RouteTag[]) => void
}

function roleLabel(role: StationRole): string {
  if (role === 'board') return 'your boarding point'
  if (role === 'alight') return 'your alighting point'
  return 'an interchange'
}

function alertBody(assessments: OutageAssessment[]): string {
  if (assessments.length === 1) {
    const a = assessments[0]
    const types = [...new Set(a.units.map((u) => u.equipmentType))]
    const equipment = types.length === 1 ? types[0] : 'step-free equipment'
    return `A ${equipment} at ${a.stationName} is reported out of service — this station is ${roleLabel(a.role)} on this route.`
  }
  const names = assessments.map((a) => a.stationName)
  const listed =
    names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `Step-free access issues reported at ${listed} may affect this route.`
}

function avoidLabel(assessments: OutageAssessment[]): string {
  const names = assessments.map((a) => a.stationName)
  if (names.length === 1) return `avoiding ${names[0]}`
  if (names.length === 2) return `avoiding ${names[0]} and ${names[1]}`
  return `avoiding ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function RerouteAlert({
  blockedAssessments,
  rerouteState,
  onFindAlternative,
  onSelectAlternative,
}: Props) {
  const { Colors, Radii } = useTheme()
  const busy = rerouteState.phase === 'loading'

  return (
    <YStack
      mt="$4"
      style={{
        borderWidth: Borders.medium,
        borderColor: Colors.warningBorder,
        borderRadius: Radii.card,
        backgroundColor: Colors.warningBg,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <XStack gap="$2" px="$3" pt="$3" pb="$2" items="flex-start">
        <MaterialIcons name="warning-amber" size={18} color={Colors.warningDark} style={styles.icon} />
        <YStack flex={1} gap="$1">
          <Text fontSize={13} fontWeight="700" color={Colors.warningDark}>
            Accessibility issue on your route
          </Text>
          <Text fontSize={12} color={Colors.warningDark}>
            {alertBody(blockedAssessments)}
          </Text>
        </YStack>
      </XStack>

      {/* Find alternative button */}
      <XStack px="$3" pb="$3">
        <TouchableOpacity
          style={[
            styles.btn,
            {
              backgroundColor: busy ? Colors.warningBorder : Colors.warningDark,
              opacity: busy ? 0.6 : 1,
            },
          ]}
          onPress={busy ? undefined : onFindAlternative}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Find alternative route"
        >
          {busy ? (
            <Spinner size="small" color="white" />
          ) : (
            <MaterialIcons name="alt-route" size={16} color="white" />
          )}
          <Text fontSize={13} fontWeight="700" color="white">
            {busy ? 'Searching…' : 'Find alternative route'}
          </Text>
        </TouchableOpacity>
      </XStack>

      {/* Results */}
      {rerouteState.phase === 'found' && (
        <YStack
          style={{
            borderTopWidth: Borders.thin,
            borderTopColor: Colors.warningBorder,
          }}
          pb="$3"
        >
          <Text
            fontSize={12}
            fontWeight="600"
            color={Colors.warningDark}
            px="$3"
            pt="$3"
            pb="$1"
          >
            Alternative routes {avoidLabel(blockedAssessments)}:
          </Text>
          {rerouteState.alternatives.map(({ journey, tags }, i) => (
            <JourneyResultCard
              key={i}
              journey={journey}
              tags={tags}
              onPress={() => onSelectAlternative(journey, tags)}
            />
          ))}
        </YStack>
      )}

      {rerouteState.phase === 'none-found' && (
        <XStack
          gap="$2"
          px="$3"
          pb="$3"
          items="flex-start"
          style={{
            borderTopWidth: Borders.thin,
            borderTopColor: Colors.warningBorder,
          }}
          pt="$3"
        >
          <MaterialIcons name="info-outline" size={16} color={Colors.warningDark} style={styles.icon} />
          <Text fontSize={12} color={Colors.warningDark} flex={1}>
            No accessible alternative routes were found for this journey.
          </Text>
        </XStack>
      )}
    </YStack>
  )
}

const styles = StyleSheet.create({
  icon: {
    marginTop: 1,
  },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
})
