import { MaterialIcons } from '@expo/vector-icons'
import { useState } from 'react'
import { Separator, Text, XStack, YStack } from 'tamagui'
import { LineChips, StepFreeBadge, type PlatformDetail } from '@/features/stations'

type PlatformAccessCardProps = {
  platforms: PlatformDetail[]
}

// Above this many platforms the list is collapsed into a dropdown so it doesn't dominate
// the home screen (some interchanges have 8–10 platforms).
const COLLAPSE_THRESHOLD = 4

/** Per-platform step-free breakdown for the selected station: which platforms are accessible
 * and which are not. Surfaces the cases where some platforms differ from the station summary.
 * Long lists collapse into a dropdown. */
export const PlatformAccessCard = ({ platforms }: PlatformAccessCardProps) => {
  const collapsible = platforms.length > COLLAPSE_THRESHOLD
  const [expanded, setExpanded] = useState(!collapsible)

  if (platforms.length === 0) return null

  const stepFreeCount = platforms.filter(p => p.step_free !== 'none').length

  return (
    <YStack mx="$4" mt="$4" gap="$2" style={{ backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 }}>
      <XStack
        items="center"
        justify="space-between"
        gap="$3"
        onPress={collapsible ? () => setExpanded(v => !v) : undefined}
        pressStyle={collapsible ? { opacity: 0.6 } : undefined}
      >
        <YStack gap="$0.5">
          <Text fontSize={15} fontWeight="700" color="#111827">Platform access</Text>
          {collapsible && !expanded && (
            <Text fontSize={12} color="#6b7280">
              {stepFreeCount} of {platforms.length} platforms step-free
            </Text>
          )}
        </YStack>
        {collapsible && (
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={24} color="#6b7280" />
        )}
      </XStack>

      {expanded && (
        <YStack>
          {platforms.map((platform, i) => (
            <YStack key={platform.name}>
              {i > 0 && <Separator borderColor="$borderColor" my="$2.5" />}
              <XStack items="center" justify="space-between" gap="$3">
                <YStack flex={1} gap="$1">
                  <Text fontSize={14} fontWeight="600" color="#111827">{platform.name}</Text>
                  <LineChips lines={platform.lines} />
                </YStack>
                <StepFreeBadge value={platform.step_free} compact />
              </XStack>
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  )
}
