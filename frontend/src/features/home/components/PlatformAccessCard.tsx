import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Separator, Text, XStack, YStack } from 'tamagui'
import { LineChips, StepFreeBadge, type PlatformDetail } from '@/features/stations'
import { useTheme, Borders, Opacity, Spacing } from '@/theme'

type PlatformAccessCardProps = {
  platforms: PlatformDetail[]
}

/**
 * Determines which lines have step-free interchange at this station.
 *
 * Two sources are combined:
 *   A) Lines that share a physical platform can always interchange step-free (walk along
 *      the platform surface — no stairs involved regardless of street accessibility).
 *   B) Lines whose platforms are all accessible from outside (step_free !== 'none') can
 *      interchange via the concourse/ticket hall, but only when there are ≥ 2 such lines.
 */
function computeInterchange(platforms: PlatformDetail[]): {
  interchangeLines: string[]
  totalLines: number
} {
  // Source A: lines that co-exist on the same platform
  const sharedPlatformLines = new Set<string>()
  for (const p of platforms) {
    if (p.lines.length >= 2) {
      p.lines.forEach((l) => sharedPlatformLines.add(l))
    }
  }

  // Source B: lines accessible from outside (any platform for that line has step_free !== 'none')
  const lineAccessMap: Record<string, boolean> = {}
  for (const p of platforms) {
    const accessible = p.step_free !== 'none'
    for (const line of p.lines) {
      lineAccessMap[line] = (lineAccessMap[line] ?? false) || accessible
    }
  }
  const outsideAccessibleLines = Object.entries(lineAccessMap)
    .filter(([, v]) => v)
    .map(([k]) => k)

  const eligible = new Set(sharedPlatformLines)
  if (outsideAccessibleLines.length >= 2) {
    outsideAccessibleLines.forEach((l) => eligible.add(l))
  }

  return {
    interchangeLines: [...eligible],
    totalLines: Object.keys(lineAccessMap).length,
  }
}

export const PlatformAccessCard = ({ platforms }: PlatformAccessCardProps) => {
  const { Colors, Radii } = useTheme()
  // Only platforms with no step-free access at all count as "not accessible"
  const inaccessible = platforms.filter((p) => p.step_free === 'none')
  const [expanded, setExpanded] = useState(false)

  const { interchangeLines, totalLines } = useMemo(() => computeInterchange(platforms), [platforms])
  const hasInterchange = totalLines >= 2 && interchangeLines.length >= 2
  const partialInterchange =
    totalLines >= 2 && interchangeLines.length >= 1 && interchangeLines.length < totalLines

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
              {inaccessible.length === 0
                ? `All ${platforms.length} platforms step-free`
                : `${inaccessible.length} of ${platforms.length} platforms not accessible`}
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
          {platforms.map((platform, i) => (
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
          ))}
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
                backgroundColor: hasInterchange
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
                  hasInterchange
                    ? Colors.success
                    : partialInterchange
                      ? Colors.warningDark
                      : Colors.danger
                }
              />
            </XStack>
            <YStack flex={1} gap="$0.5">
              <Text fontSize={13} fontWeight="600" color={Colors.text}>
                {hasInterchange
                  ? interchangeLines.length === totalLines
                    ? 'Full step-free interchange'
                    : 'Step-free interchange'
                  : partialInterchange
                    ? 'Step-free interchange'
                    : 'No step-free interchange'}
              </Text>
              {(hasInterchange || partialInterchange) &&
                interchangeLines.length < totalLines && (
                  <XStack gap="$1" items="center" flexWrap="wrap">
                    <Text fontSize={11} color={Colors.secondaryText}>
                      Only between
                    </Text>
                    <LineChips lines={interchangeLines} />
                  </XStack>
                )}
            </YStack>
          </XStack>
        </>
      )}
    </YStack>
  )
}
