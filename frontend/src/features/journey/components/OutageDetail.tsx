import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { formatTime, isToday, parseUtc } from '@/lib/datetime'
import type {
  AssessedUnit,
  OutageAssessment,
  StationRole,
  UnitVerdict,
} from '@/features/journey/api/outageRelevance'
import { OutageTimeline } from '@/features/outages/OutageTimeline'
import { useTheme, Borders } from '@/theme'

type FailureDetail = components['schemas']['FailureDetail']

type VerdictStyle = {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  background: string
  border: string
  label: string
}

function roleText(role: StationRole, lines: string[]): string | null {
  const service = lines.length > 0 ? ` (${lines.join(' / ')})` : ''
  switch (role) {
    case 'board':
      return `You board here${service}`
    case 'alight':
      return `You exit here${service}`
    case 'interchange':
      return `You change here${service}`
    default:
      return null
  }
}

function reportMeta(unit: AssessedUnit): string {
  const count = `Reported ${unit.reportCount}×`
  if (!unit.lastReported) return count
  const d = parseUtc(unit.lastReported)
  const when = isToday(unit.lastReported)
    ? formatTime(unit.lastReported)
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${count} · last ${when}`
}

function verdictDetail(unit: AssessedUnit): string {
  switch (unit.verdict) {
    case 'on-your-platform':
      return 'Serves a platform your service uses here.'
    case 'shared-route':
      return 'Connects areas you pass through here.'
    case 'other-platform':
      return "Serves a platform your route doesn't appear to use."
    default:
      return "Couldn't confirm whether this is on your route."
  }
}

export const OutageDetail = ({ assessments }: { assessments: OutageAssessment[] }) => {
  const { Colors, Radii } = useTheme()
  // Lazily-fetched event timeline per failure, opened via the per-problem dropdown.
  const [expandedFailureId, setExpandedFailureId] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, FailureDetail>>({})
  const [loadingFailureId, setLoadingFailureId] = useState<number | null>(null)

  async function toggleTimeline(failureId: number) {
    if (expandedFailureId === failureId) {
      setExpandedFailureId(null)
      return
    }
    setExpandedFailureId(failureId)
    if (details[failureId]) return
    setLoadingFailureId(failureId)
    const { data } = await apiClient.GET('/failures/{failure_id}', {
      params: { path: { failure_id: failureId } },
    })
    if (data) setDetails((prev) => ({ ...prev, [failureId]: data }))
    setLoadingFailureId(null)
  }

  const VERDICTS = useMemo<Record<UnitVerdict, VerdictStyle>>(
    () => ({
      'on-your-platform': {
        icon: 'error',
        color: Colors.dangerDark,
        background: Colors.dangerBg,
        border: Colors.dangerBorder,
        label: 'On your route',
      },
      'shared-route': {
        icon: 'warning',
        color: Colors.warningDark,
        background: Colors.warningBg,
        border: Colors.warningBorder,
        label: 'On your path here',
      },
      'other-platform': {
        icon: 'info',
        color: Colors.text,
        background: Colors.searchBg,
        border: Colors.border,
        label: 'Likely a different platform',
      },
      unknown: {
        icon: 'help-outline',
        color: Colors.text,
        background: Colors.searchBg,
        border: Colors.border,
        label: 'Out of service',
      },
    }),
    [Colors],
  )
  if (assessments.length === 0) return null
  return (
    <YStack gap="$3">
      <Text fontSize={16} fontWeight="700" color={Colors.text}>
        Accessibility alerts on this route
      </Text>
      {assessments.map((station) => {
        const role = roleText(station.role, station.journeyLines)
        return (
          <YStack
            key={station.stationName}
            gap="$2.5"
            p="$3"
            style={{
              borderWidth: Borders.medium,
              borderColor: Colors.border,
              borderRadius: Radii.button,
            }}
          >
            <YStack gap="$0.5">
              <Text fontSize={15} fontWeight="700" color={Colors.text}>
                {station.stationName}
              </Text>
              {role && (
                <Text fontSize={13} color={Colors.secondaryText}>
                  {role}
                </Text>
              )}
            </YStack>

            {station.units.map((unit, i) => {
              const v = VERDICTS[unit.verdict]
              return (
                <YStack
                  key={i}
                  gap="$1.5"
                  p="$2.5"
                  style={{
                    backgroundColor: v.background,
                    borderWidth: Borders.thin,
                    borderColor: v.border,
                    borderRadius: Radii.small,
                  }}
                >
                  <XStack gap="$2" items="center">
                    <MaterialIcons name={v.icon} size={16} color={v.color} />
                    <Text fontSize={13} fontWeight="700" flex={1} style={{ color: v.color }}>
                      {v.label}
                    </Text>
                  </XStack>
                  <Text fontSize={14} color={Colors.text}>
                    {unit.connection}
                  </Text>
                  <Text fontSize={13} style={{ color: v.color }}>
                    {verdictDetail(unit)}
                  </Text>
                  {unit.verified && (
                    <XStack items="center" gap="$1">
                      <MaterialIcons name="verified" size={13} color="#1d4ed8" />
                      <Text fontSize={12} fontWeight="600" color="#1d4ed8">
                        Verified on-site
                        {unit.verificationCount > 1 ? ` (${unit.verificationCount}×)` : ''}
                      </Text>
                    </XStack>
                  )}
                  <Text fontSize={12} color={Colors.secondaryText}>
                    {reportMeta(unit)}
                    {unit.estimated ? ' · location estimated' : ''}
                  </Text>

                  {/* Per-problem dropdown: lazily loads and shows the full event timeline. */}
                  <XStack
                    items="center"
                    gap="$1"
                    mt="$0.5"
                    onPress={() => toggleTimeline(unit.failureId)}
                    pressStyle={{ opacity: 0.6 }}
                  >
                    <Text fontSize={12} fontWeight="600" style={{ color: v.color }}>
                      {expandedFailureId === unit.failureId ? 'Hide timeline' : 'View timeline'}
                    </Text>
                    <MaterialIcons
                      name={expandedFailureId === unit.failureId ? 'expand-less' : 'expand-more'}
                      size={16}
                      color={v.color}
                    />
                  </XStack>
                  {expandedFailureId === unit.failureId &&
                    (loadingFailureId === unit.failureId ? (
                      <Spinner color={Colors.secondaryText} />
                    ) : details[unit.failureId] ? (
                      <YStack pt="$1">
                        <OutageTimeline
                          reports={details[unit.failureId].reports}
                          verifications={details[unit.failureId].verifications}
                          resolvedAt={details[unit.failureId].resolved_at}
                          resolutionDescription={details[unit.failureId].resolution_description}
                        />
                      </YStack>
                    ) : null)}
                </YStack>
              )
            })}
          </YStack>
        )
      })}
    </YStack>
  )
}
