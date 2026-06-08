import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Separator, Text, XStack, YStack } from 'tamagui'
import { LineChips, StepFreeBadge, type PlatformDetail } from '@/features/stations'
import { useTheme, Borders, Opacity, Spacing } from '@/theme'

type PlatformAccessCardProps = {
  platforms: PlatformDetail[]
}

/** Lines that share a step-free accessible route through this station. Two or more accessible
 * lines means step-free interchange is possible (via the shared ticket hall / concourse). */
function computeInterchange(platforms: PlatformDetail[]): {
  accessibleLines: string[]
  totalLines: number
} {
  const lineMap: Record<string, boolean> = {}
  for (const p of platforms) {
    const accessible = p.step_free !== 'none'
    for (const line of p.lines) {
      lineMap[line] = (lineMap[line] ?? false) || accessible
    }
  }
  return {
    accessibleLines: Object.entries(lineMap)
      .filter(([, v]) => v)
      .map(([k]) => k),
    totalLines: Object.keys(lineMap).length,
  }
}

export const PlatformAccessCard = ({ platforms }: PlatformAccessCardProps) => {
  const { Colors, Radii } = useTheme()
  const degraded = platforms.filter((p) => p.step_free !== 'full')
  const allFull = degraded.length === 0
  const [expanded, setExpanded] = useState(false)

  const { accessibleLines, totalLines } = useMemo(() => computeInterchange(platforms), [platforms])
  const hasInterchange = totalLines >= 2 && accessibleLines.length >= 2
  const partialInterchange = totalLines >= 2 && accessibleLines.length >= 1 && accessibleLines.length < totalLines

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
        <YStack gap="$0">
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

      {/* Step-free interchange row — shown for multi-line stations */}
      {totalLines >= 2 && (
        <>
          <Separator borderColor={Colors.border} />
          <XStack items="center" gap="$2">
            <XStack
              style={{
                width: 28,
                height: 28,
                borderRadius: Radii.small,
                backgroundColor:
                  hasInterchange || (allFull && totalLines >= 2)
                    ? Colors.successBg
                    : partialInterchange
                      ? Colors.warningBg
                      : Colors.dangerBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons
                name="accessible"
                size={16}
                color={
                  hasInterchange || (allFull && totalLines >= 2)
                    ? Colors.success
                    : partialInterchange
                      ? Colors.warningDark
                      : Colors.danger
                }
              />
            </XStack>
            <YStack flex={1} gap="$0.5">
              <Text fontSize={13} fontWeight="600" color={Colors.text}>
                {allFull && totalLines >= 2
                  ? 'Full step-free interchange'
                  : hasInterchange
                    ? 'Step-free interchange'
                    : partialInterchange
                      ? 'Partial step-free interchange'
                      : 'No step-free interchange'}
              </Text>
              {partialInterchange && accessibleLines.length > 0 && (
                <XStack gap="$1" items="center" flexWrap="wrap">
                  <Text fontSize={11} color={Colors.secondaryText}>
                    Only between
                  </Text>
                  <LineChips lines={accessibleLines} />
                </XStack>
              )}
            </YStack>
          </XStack>
        </>
      )}
    </YStack>
  )
}
