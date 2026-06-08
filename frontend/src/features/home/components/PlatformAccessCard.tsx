import { MaterialIcons } from '@expo/vector-icons'
import { useState } from 'react'
import { Separator, Text, XStack, YStack } from 'tamagui'
import { LineChips, StepFreeBadge, type PlatformDetail } from '@/features/stations'
import { useTheme, Borders, Opacity, Spacing } from '@/theme'

type PlatformAccessCardProps = {
  platforms: PlatformDetail[]
}

export const PlatformAccessCard = ({ platforms }: PlatformAccessCardProps) => {
  const { Colors, Radii } = useTheme()
  const degraded = platforms.filter((p) => p.step_free !== 'full')
  const allFull = degraded.length === 0
  const [expanded, setExpanded] = useState(false)

  if (platforms.length === 0) return null

  return (
    <YStack
      mx="$4"
      mt="$4"
      gap="$2"
      style={{
        backgroundColor: Colors.card,
        borderRadius: Radii.button,
        borderWidth: Borders.thin,
        borderColor: Colors.border,
        padding: Spacing.lg,
      }}
    >
      <XStack
        items="center"
        justify="space-between"
        gap="$3"
        onPress={() => setExpanded((v) => !v)}
        pressStyle={{ opacity: Opacity.disabledMid }}
      >
        <YStack gap="$0.5">
          <Text fontSize={15} fontWeight="700" color={Colors.text}>
            Platform access
          </Text>
          {!expanded && (
            <Text fontSize={12} color={Colors.secondaryText}>
              {allFull
                ? `All ${platforms.length} platforms step-free`
                : `${degraded.length} of ${platforms.length} platforms not fully step-free`}
            </Text>
          )}
        </YStack>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
          color={Colors.secondaryText}
        />
      </XStack>

      {expanded && (
        <YStack>
          {allFull ? (
            <XStack items="center" justify="space-between" gap="$3">
              <Text flex={1} fontSize={14} color={Colors.text}>
                All {platforms.length} platforms have full step-free access
              </Text>
              <StepFreeBadge value="full" compact />
            </XStack>
          ) : (
            degraded.map((platform, i) => (
              <YStack key={platform.name}>
                {i > 0 && <Separator borderColor="$borderColor" my="$2.5" />}
                <XStack items="center" justify="space-between" gap="$3">
                  <YStack flex={1} gap="$1">
                    <Text fontSize={14} fontWeight="600" color={Colors.text}>
                      {platform.name}
                    </Text>
                    <LineChips lines={platform.lines} />
                  </YStack>
                  <StepFreeBadge value={platform.step_free} compact />
                </XStack>
              </YStack>
            ))
          )}
        </YStack>
      )}
    </YStack>
  )
}
