import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Separator, Text, XStack, YStack } from 'tamagui'
import { platformEndpoints } from '@/features/journey/api/accessibility'
import { LineChips, StepFreeBadge, type PlatformDetail } from '@/features/stations'
import type { OutageReport } from '@/features/outages/types'
import { useTheme, Borders, Opacity, Spacing } from '@/theme'

type PlatformAccessCardProps = {
  platforms: PlatformDetail[]
  reports?: OutageReport[]
}

function extractDirection(name: string): string {
  const m = name.match(/^(Northbound|Southbound|Eastbound|Westbound)/i)
  return m ? m[1] : ''
}

function labelDirections(dirs: string[]): string {
  if (dirs.length === 1) return dirs[0]
  if (dirs.length === 2) return 'Both directions'
  return 'All directions'
}

type InterchangeGroup = { label: string; lines: string[] }

/** Produces the list of step-free interchange groups shown in the expanded dropdown. */
function computeInterchangeGroups(platforms: PlatformDetail[]): InterchangeGroup[] {
  // --- Shared-platform groups ---
  // Key = sorted line names; value = set of directions where those lines share a platform.
  const sharedMap = new Map<string, Set<string>>()
  for (const p of platforms) {
    if (p.lines.length >= 2) {
      const key = [...p.lines].sort().join('|')
      if (!sharedMap.has(key)) sharedMap.set(key, new Set())
      const dir = extractDirection(p.name)
      sharedMap.get(key)!.add(dir || 'Shared platform')
    }
  }
  const groups: InterchangeGroup[] = [...sharedMap.entries()].map(([key, dirs]) => ({
    label: labelDirections([...dirs]),
    lines: key.split('|'),
  }))

  // --- Concourse group ---
  // Lines accessible from outside that are not already all covered by a single shared group.
  const lineAccessMap: Record<string, boolean> = {}
  for (const p of platforms) {
    const accessible = p.step_free !== 'none'
    for (const l of p.lines) {
      lineAccessMap[l] = (lineAccessMap[l] ?? false) || accessible
    }
  }
  const outsideLines = Object.entries(lineAccessMap)
    .filter(([, v]) => v)
    .map(([k]) => k)

  if (outsideLines.length >= 2) {
    const outsideSet = new Set(outsideLines)
    const coveredBySingle = [...sharedMap.keys()].some((key) => {
      const sharedLines = key.split('|')
      return (
        sharedLines.length === outsideLines.length && sharedLines.every((l) => outsideSet.has(l))
      )
    })
    if (!coveredBySingle) {
      groups.push({ label: 'Via concourse', lines: outsideLines })
    }
  }

  return groups
}

/**
 * Determines which lines have step-free interchange at this station (for the summary).
 *
 * Two sources are combined:
 *   A) Lines that share a physical platform can always interchange step-free.
 *   B) Lines accessible from outside (step_free !== 'none') can interchange via the
 *      concourse/ticket hall, but only when there are ≥ 2 such lines.
 */
function computeInterchange(platforms: PlatformDetail[]): {
  interchangeLines: string[]
  allLines: string[]
  totalLines: number
} {
  const sharedPlatformLines = new Set<string>()
  for (const p of platforms) {
    if (p.lines.length >= 2) p.lines.forEach((l) => sharedPlatformLines.add(l))
  }

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
    allLines: Object.keys(lineAccessMap),
    totalLines: Object.keys(lineAccessMap).length,
  }
}

/** Lowercase platform endpoint strings from all unresolved lift reports at this station. */
function liveDisruptedEndpoints(reports: OutageReport[]): string[] {
  const out: string[] = []
  for (const r of reports) {
    if (r.failure.resolved) continue
    if (r.failure.equipment.equipment_type.name !== 'lift') continue
    out.push(...platformEndpoints(r.failure.equipment.connection).map((e) => e.toLowerCase()))
  }
  return out
}

/** True when a lift outage's connection string names this platform. */
function isPlatformAffected(platform: PlatformDetail, endpoints: string[]): boolean {
  if (endpoints.length === 0) return false
  const name = platform.name.toLowerCase()
  return endpoints.some((ep) => name.includes(ep))
}

function buildSummary(platforms: PlatformDetail[], disruptedCount: number): string {
  const toTrain = platforms.filter((p) => p.step_free === 'Full' || p.step_free === 'to_train').length
  const toPlatform = platforms.filter((p) => p.step_free === 'to_platform').length
  const noneAll = platforms.filter((p) => p.step_free === 'none').length
  const permanentNone = noneAll - disruptedCount
  const n = platforms.length

  if (noneAll === 0 && toPlatform === 0) return `All ${n} step-free to train`
  if (noneAll === 0 && toTrain === 0) return `All ${n} step-free to platform`
  if (noneAll === n) return disruptedCount === n ? 'All platforms disrupted' : 'No step-free access'

  const parts: string[] = []
  if (toTrain > 0) parts.push(`${toTrain} to train`)
  if (toPlatform > 0) parts.push(`${toPlatform} to platform`)
  if (disruptedCount > 0) parts.push(`${disruptedCount} disrupted`)
  if (permanentNone > 0) parts.push(`${permanentNone} not accessible`)
  return parts.join(' · ')
}

export const PlatformAccessCard = ({ platforms, reports = [] }: PlatformAccessCardProps) => {
  const { Colors, Radii } = useTheme()
  const [expanded, setExpanded] = useState(false)

  // Overlay live lift outages onto the static platform step-free data.
  const disruptedEndpoints = useMemo(() => liveDisruptedEndpoints(reports), [reports])

  // Set of platform names currently blocked by a reported outage.
  const disruptedNames = useMemo(
    () =>
      new Set(
        platforms
          .filter((p) => isPlatformAffected(p, disruptedEndpoints) && p.step_free !== 'none')
          .map((p) => p.name),
      ),
    [platforms, disruptedEndpoints],
  )

  // effectivePlatforms is used for summary counts and interchange logic.
  // Disrupted platforms appear as 'none' so the numbers reflect live reality.
  const effectivePlatforms = useMemo(
    () =>
      disruptedNames.size === 0
        ? platforms
        : platforms.map((p) =>
            disruptedNames.has(p.name) ? { ...p, step_free: 'none' as const } : p,
          ),
    [platforms, disruptedNames],
  )

  const inaccessible = effectivePlatforms.filter((p) => p.step_free === 'none')
  const toPlatformOnly = effectivePlatforms.filter((p) => p.step_free === 'to_platform')

  const isAllAccessible = inaccessible.length === 0 && toPlatformOnly.length === 0
  const isAllInaccessible = inaccessible.length === platforms.length
  const summaryBg = isAllAccessible
    ? Colors.successBg
    : isAllInaccessible
      ? Colors.dangerBg
      : Colors.warningBg
  const summaryColor = isAllAccessible
    ? Colors.success
    : isAllInaccessible
      ? Colors.danger
      : Colors.warningDark

  const { interchangeLines, allLines, totalLines } = useMemo(
    () => computeInterchange(effectivePlatforms),
    [effectivePlatforms],
  )
  const isFullInterchange = totalLines >= 2 && interchangeLines.length === totalLines
  const isSomeInterchange =
    totalLines >= 2 && interchangeLines.length > 0 && interchangeLines.length < totalLines
  const groups = useMemo(() => computeInterchangeGroups(effectivePlatforms), [effectivePlatforms])
  const [interchangeExpanded, setInterchangeExpanded] = useState(false)
  const showDropdown = isSomeInterchange && groups.length > 0

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
        items="flex-start"
        gap="$3"
        onPress={() => setExpanded((v) => !v)}
        pressStyle={{ opacity: Opacity.disabledMid }}
      >
        <XStack
          style={{
            width: 36,
            height: 36,
            borderRadius: Radii.small,
            backgroundColor: summaryBg,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MaterialIcons name="accessible" size={20} color={summaryColor} />
        </XStack>
        <YStack flex={1} gap="$0.5" style={{ flexShrink: 1 }}>
          <Text fontSize={15} fontWeight="700" color={Colors.text}>
            Platform access
          </Text>
          {!expanded && (
            <Text fontSize={12} color={Colors.secondaryText} style={{ flexShrink: 1 }}>
              {buildSummary(effectivePlatforms, disruptedNames.size)}
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
          {platforms.map((original, i) => {
            const isDisrupted = disruptedNames.has(original.name)
            return (
              <YStack key={original.name}>
                {i > 0 && <Separator borderColor="$borderColor" my="$2.5" />}
                <XStack items="center" justify="space-between" gap="$3">
                  <YStack flex={1} gap="$1">
                    <Text fontSize={14} fontWeight="600" color={Colors.text}>
                      {original.name}
                    </Text>
                    <LineChips lines={original.lines} />
                  </YStack>
                  {isDisrupted ? (
                    <YStack items="flex-end" gap="$1">
                      <XStack
                        items="center"
                        gap="$1"
                        px="$2"
                        py="$1"
                        style={{ backgroundColor: Colors.warningBg, borderRadius: Radii.xs }}
                      >
                        <MaterialIcons name="warning" size={11} color={Colors.warningDark} />
                        <Text fontSize={11} fontWeight="600" color={Colors.warningDark}>
                          Reported outage
                        </Text>
                      </XStack>
                      <XStack style={{ opacity: 0.4 }}>
                        <StepFreeBadge value={original.step_free} compact />
                      </XStack>
                    </YStack>
                  ) : (
                    <StepFreeBadge value={original.step_free} compact />
                  )}
                </XStack>
              </YStack>
            )
          })}
        </YStack>
      )}

      {/* Step-free interchange row — shown for multi-line stations */}
      {totalLines >= 2 && (
        <>
          <Separator borderColor={Colors.border} />
          <XStack
            items="center"
            gap="$2"
            onPress={showDropdown ? () => setInterchangeExpanded((v) => !v) : undefined}
            pressStyle={showDropdown ? { opacity: Opacity.disabledMid } : undefined}
          >
            <XStack
              style={{
                width: 36,
                height: 36,
                borderRadius: Radii.small,
                backgroundColor: isFullInterchange
                  ? Colors.successBg
                  : isSomeInterchange
                    ? Colors.warningBg
                    : Colors.dangerBg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MaterialIcons
                name="accessible"
                size={20}
                color={
                  isFullInterchange
                    ? Colors.success
                    : isSomeInterchange
                      ? Colors.warningDark
                      : Colors.danger
                }
              />
            </XStack>
            <YStack flex={1} gap="$0.5">
              <Text fontSize={13} fontWeight="600" color={Colors.text}>
                {isFullInterchange
                  ? 'Full step-free interchange'
                  : isSomeInterchange
                    ? 'Some step-free interchange'
                    : 'No step-free interchange'}
              </Text>
              {(isFullInterchange || isSomeInterchange) && (
                <LineChips lines={isFullInterchange ? allLines : interchangeLines} />
              )}
            </YStack>
            {showDropdown && (
              <MaterialIcons
                name={interchangeExpanded ? 'expand-less' : 'expand-more'}
                size={20}
                color={Colors.secondaryText}
              />
            )}
          </XStack>

          {interchangeExpanded && showDropdown && (
            <YStack gap="$2" pl="$1">
              {groups.map((group) => {
                const isBothDir =
                  group.label === 'Both directions' || group.label === 'All directions'
                const isConcourse = group.label === 'Via concourse'
                const labelBg = isBothDir
                  ? Colors.successBg
                  : isConcourse
                    ? Colors.blueBg
                    : Colors.warningBg
                const labelColor = isBothDir
                  ? Colors.success
                  : isConcourse
                    ? Colors.blue
                    : Colors.warningDark
                return (
                  <XStack key={group.label} items="center" gap="$2" flexWrap="wrap">
                    <XStack
                      px="$2"
                      py="$0.5"
                      style={{ backgroundColor: labelBg, borderRadius: Radii.xs }}
                    >
                      <Text fontSize={11} fontWeight="600" color={labelColor}>
                        {group.label}
                      </Text>
                    </XStack>
                    <LineChips lines={group.lines} />
                  </XStack>
                )
              })}
            </YStack>
          )}
        </>
      )}
    </YStack>
  )
}
