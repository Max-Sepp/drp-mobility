import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { Pressable, StyleSheet } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import type { components } from '@/api/schema.d'
import { TflBadge } from '@/components/TflBadge'
import { OutageTimeline } from '@/features/outages/OutageTimeline'
import { formatConnection } from '@/lib/connection'
import { formatDatetime } from '@/lib/datetime'
import { useTheme, Borders, Spacing } from '@/theme'
import { reportSeverity } from '@/features/outages/severity'

type OutageReport = components['schemas']['OutageReportSummary']

function isTfl(report: OutageReport): boolean {
  return (report as OutageReport & { source?: string }).source === 'tfl'
}

type OutageReportCardProps = {
  /** All active reports under the same failure, sorted oldest-first. */
  reports: OutageReport[]
  expanded: boolean
  onToggle: () => void
  onVerify?: () => void
  verifying?: boolean
  onResolve?: () => void
  resolving?: boolean
}

function alertLabel(report: OutageReport, resolved: boolean): string {
  const equipment = report.failure.equipment
  if (equipment.equipment_type.name === 'overcrowding') return 'Overcrowding reported'
  if (equipment.equipment_type.name === 'custom') return 'Custom issue reported'
  const type = equipment.equipment_type.name === 'lift' ? 'Lift' : 'Escalator'
  // TfL data reports an official outage; user reports describe something "broken".
  const status = resolved ? 'resolved' : isTfl(report) ? 'out of service' : 'broken'
  return `${type} ${status} – ${formatConnection(equipment.connection, equipment.equipment_type.name)}`
}

export const OutageReportCard = ({
  reports,
  expanded,
  onToggle,
  onVerify,
  verifying,
  onResolve,
  resolving,
}: OutageReportCardProps) => {
  const { Colors, Radii } = useTheme()

  const severity = reports[0] ? reportSeverity(reports[0]) : 'danger'
  const bgColor = severity === 'warning' ? Colors.warningBg : Colors.dangerBg
  const darkColor = severity === 'warning' ? Colors.warningDark : Colors.dangerDark
  const borderColor = severity === 'warning' ? Colors.warningBorder : Colors.dangerBorder

  const times = reports.map((r) => r.breakdown_time).sort()
  const firstReported = times[0]
  const reportCount = reports.length
  const official = reports.some(isTfl)
  const hasTrustedReporter = reports.some((r) => r.reporter_role === 'trusted')
  // Verification and resolution are failure-scoped, so every report under this group carries the
  // same failure state.
  const failure = reports[0].failure
  const verifications = failure.verifications ?? []
  const verified = verifications.length > 0
  const resolved = failure.resolved

  // When resolved, the card chrome switches to the success palette to signal it's fixed; otherwise
  // it follows the report severity (amber for warnings, red for step-free-blocking failures).
  const accent = resolved ? Colors.successDark : darkColor
  const cardBg = resolved ? Colors.successBg : bgColor

  // A resolved outage can no longer be verified or resolved again.
  const showActions = !resolved && (!!onVerify || !!onResolve)

  const styles = StyleSheet.create({
    card: {
      backgroundColor: cardBg,
      borderRadius: Radii.button,
      borderWidth: Borders.thin,
      borderColor: Colors.border,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: resolved ? Colors.successDark : borderColor,
      opacity: 0.5,
    },
  })

  const actionRow = showActions ? (
    <XStack px="$4" pb="$4" gap="$2">
      {onVerify && (
        <Pressable
          onPress={onVerify}
          disabled={verifying}
          style={[
            actionStyles.button,
            { borderColor: '#1d4ed8', flex: 1, opacity: verifying ? 0.6 : 1 },
          ]}
        >
          {verifying ? (
            <Spinner size="small" color="#1d4ed8" />
          ) : (
            <Ionicons name="checkmark-circle-outline" size={16} color="#1d4ed8" />
          )}
          <Text fontSize={13} fontWeight="600" color="#1d4ed8">
            {verifying ? 'Verifying…' : verified ? 'Verify again' : 'Verify on-site'}
          </Text>
        </Pressable>
      )}
      {onResolve && (
        <Pressable
          onPress={onResolve}
          disabled={resolving}
          style={[
            actionStyles.button,
            { borderColor: Colors.successDark, flex: 1, opacity: resolving ? 0.6 : 1 },
          ]}
        >
          {resolving ? (
            <Spinner size="small" color={Colors.successDark} />
          ) : (
            <Ionicons name="checkmark-done-outline" size={16} color={Colors.successDark} />
          )}
          <Text fontSize={13} fontWeight="600" color={Colors.successDark}>
            {resolving ? 'Resolving…' : 'Mark Resolved'}
          </Text>
        </Pressable>
      )}
    </XStack>
  ) : null

  return (
    <YStack style={styles.card}>
      {/* Header row — always tappable */}
      <XStack
        px="$4"
        py="$3"
        items="center"
        gap="$3"
        onPress={onToggle}
        pressStyle={{ opacity: 0.7 }}
      >
        <YStack
          style={{
            width: 32,
            height: 32,
            borderRadius: Radii.small,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {resolved ? (
            <Ionicons name="checkmark" size={18} color={Colors.card} />
          ) : (
            <Text color={Colors.card} fontWeight="700" fontSize={16}>
              !
            </Text>
          )}
        </YStack>

        <YStack flex={1} gap="$0.5">
          <Text fontSize={14} fontWeight="700" color={accent} numberOfLines={2}>
            {alertLabel(reports[0], resolved)}
          </Text>
          <Text fontSize={12} color={accent}>
            {official ? 'Published by TfL' : 'first reported'} {formatDatetime(firstReported)}
          </Text>
          {official && (
            <XStack mt="$0.5">
              <TflBadge label="Official · TfL" />
            </XStack>
          )}
          {resolved && (
            <XStack items="center" gap="$1" mt="$0.5">
              <Ionicons name="checkmark-done-circle" size={11} color={Colors.successDark} />
              <Text fontSize={11} fontWeight="600" color={Colors.successDark}>
                Resolved
              </Text>
            </XStack>
          )}
          {!official && hasTrustedReporter && (
            <XStack items="center" gap="$1" mt="$0.5">
              <Ionicons name="shield-checkmark" size={11} color="#15803d" />
              <Text fontSize={11} fontWeight="600" color="#15803d">
                TfL worker
              </Text>
            </XStack>
          )}
          {verified && (
            <XStack items="center" gap="$1" mt="$0.5">
              <Ionicons name="checkmark-circle" size={11} color="#1d4ed8" />
              <Text fontSize={11} fontWeight="600" color="#1d4ed8">
                Verified on-site
              </Text>
            </XStack>
          )}
        </YStack>

        <YStack items="flex-end" gap="$1" style={{ flexShrink: 0 }}>
          {!official && reportCount > 1 && (
            <Text fontSize={11} fontWeight="700" color={accent}>
              {reportCount} reports
            </Text>
          )}
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={accent} />
        </YStack>
      </XStack>

      {/* Expanded detail */}
      {expanded && (
        <YStack>
          <YStack style={[styles.divider, { marginHorizontal: Spacing.lg }]} />
          {/* Merged timeline: reports, verifications and (once fixed) the resolution, newest first. */}
          <YStack px="$4" pt="$3" pb="$4">
            <OutageTimeline
              reports={reports}
              verifications={verifications}
              resolvedAt={resolved ? failure.resolved_at : null}
              resolutionDescription={failure.resolution_description}
            />
          </YStack>
          {actionRow}
        </YStack>
      )}
    </YStack>
  )
}

const actionStyles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1.5,
  },
})
