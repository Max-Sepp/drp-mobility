import { MaterialIcons } from '@expo/vector-icons'
import { useState } from 'react'
import { Separator, Text, XStack, YStack } from 'tamagui'
import { LineChips, StepFreeBadge, type PlatformDetail } from '@/features/stations'

type PlatformAccessCardProps = {
  platforms: PlatformDetail[]
}

/** Per-platform step-free breakdown for the selected station, collapsed into a dropdown so it
 * doesn't dominate the home screen. To avoid a long list of identical "full" rows, when every
 * platform has full step-free access we show a single summary line; otherwise we list only the
 * platforms that are not fully step-free. */
export const PlatformAccessCard = ({ platforms }: PlatformAccessCardProps) => {
  // Only platforms that aren't fully step-free are worth listing individually.
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
        backgroundColor: 'white',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        padding: 16,
      }}
    >
      <XStack
        items="center"
        justify="space-between"
        gap="$3"
        onPress={() => setExpanded((v) => !v)}
        pressStyle={{ opacity: 0.6 }}
      >
        <YStack gap="$0.5">
          <Text fontSize={15} fontWeight="700" color="#111827">
            Platform access
          </Text>
          {!expanded && (
            <Text fontSize={12} color="#6b7280">
              {allFull
                ? `All ${platforms.length} platforms step-free`
                : `${degraded.length} of ${platforms.length} platforms not fully step-free`}
            </Text>
          )}
        </YStack>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={24} color="#6b7280" />
      </XStack>

      {expanded && (
        <YStack>
          {allFull ? (
            <XStack items="center" justify="space-between" gap="$3">
              <Text flex={1} fontSize={14} color="#374151">
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
                    <Text fontSize={14} fontWeight="600" color="#111827">
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
