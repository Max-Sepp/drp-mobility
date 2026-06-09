import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { Image, Pressable, StyleSheet } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { BASE_URL } from '@/api/client'
import type { components } from '@/api/schema.d'
import { formatDatetime } from '@/lib/datetime'
import { useTheme, Borders, Spacing } from '@/theme'

type OutageReport = components['schemas']['OutageReportSummary']
type Verification = components['schemas']['OutageReportVerificationSchema']

// One entry in the merged failure timeline: a user report, an on-site verification, or resolution.
type TimelineEvent =
  | { kind: 'reported'; time: string; report: OutageReport }
  | { kind: 'verified'; time: string; verification: Verification }
  | { kind: 'resolved'; time: string; description: string | null }

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
  const type = equipment.equipment_type.name === 'lift' ? 'Lift' : 'Escalator'
  const status = resolved ? 'resolved' : 'broken'
  return `${type} ${status} – ${equipment.connection}`
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

  const times = reports.map((r) => r.breakdown_time).sort()
  const firstReported = times[0]
  const reportCount = reports.length
  const hasTrustedReporter = reports.some((r) => r.reporter_role === 'trusted')

  // Verification and resolution are failure-scoped, so every report under this group carries the
  // same failure state.
  const failure = reports[0].failure
  const verifications = failure.verifications ?? []
  const verified = verifications.length > 0
  const resolved = failure.resolved

  // When resolved, the card chrome switches to the success palette to signal it's fixed.
  const accent = resolved ? Colors.successDark : Colors.dangerDark
  const cardBg = resolved ? Colors.successBg : Colors.dangerBg

  // Merge reports, verifications and (if any) the resolution into one timeline, newest first.
  const timeline: TimelineEvent[] = [
    ...reports.map(
      (report): TimelineEvent => ({ kind: 'reported', time: report.breakdown_time, report }),
    ),
    ...verifications.map(
      (verification): TimelineEvent => ({
        kind: 'verified',
        time: verification.verified_at,
        verification,
      }),
    ),
    ...(resolved && failure.resolved_at
      ? [
          {
            kind: 'resolved' as const,
            time: failure.resolved_at,
            description: failure.resolution_description ?? null,
          },
        ]
      : []),
  ].sort((a, b) => b.time.localeCompare(a.time))

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
      backgroundColor: resolved ? Colors.successDark : Colors.dangerBorder,
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
            first reported {formatDatetime(firstReported)}
          </Text>
          {resolved && (
            <XStack items="center" gap="$1" mt="$0.5">
              <Ionicons name="checkmark-done-circle" size={11} color={Colors.successDark} />
              <Text fontSize={11} fontWeight="600" color={Colors.successDark}>
                Resolved
              </Text>
            </XStack>
          )}
          {hasTrustedReporter && (
            <XStack items="center" gap="$1" mt="$0.5">
              <Ionicons name="shield-checkmark" size={11} color="#15803d" />
              <Text fontSize={11} fontWeight="600" color="#15803d">
                Trusted reporter
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
          {reportCount > 1 && (
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
          <YStack px="$4" pt="$3" pb="$4" gap="$3">
            {timeline.map((event) => {
              if (event.kind === 'reported') {
                return (
                  <XStack key={`report-${event.report.id}`} gap="$2.5" items="flex-start">
                    <Ionicons
                      name="alert-circle"
                      size={16}
                      color={Colors.dangerDark}
                      style={{ marginTop: 1 }}
                    />
                    <YStack flex={1} gap="$1">
                      <XStack items="center" gap="$2" flexWrap="wrap">
                        <Text fontSize={12} fontWeight="700" color={Colors.dangerDark}>
                          Reported
                        </Text>
                        <Text fontSize={11} color={Colors.dangerDark} style={{ opacity: 0.7 }}>
                          {formatDatetime(event.time)}
                        </Text>
                        {event.report.reporter_role === 'trusted' && (
                          <XStack items="center" gap="$1">
                            <Ionicons name="shield-checkmark" size={10} color="#15803d" />
                            <Text fontSize={11} fontWeight="600" color="#15803d">
                              Trusted
                            </Text>
                          </XStack>
                        )}
                      </XStack>
                      {event.report.description && (
                        <Text fontSize={13} color={Colors.dangerDark} fontStyle="italic">
                          &quot;{event.report.description}&quot;
                        </Text>
                      )}
                      {event.report.image_content_type && (
                        <Image
                          source={{ uri: `${BASE_URL}/outage-reports/${event.report.id}/image` }}
                          style={{ width: '100%', height: 180, borderRadius: Radii.small }}
                          resizeMode="cover"
                        />
                      )}
                    </YStack>
                  </XStack>
                )
              }
              if (event.kind === 'verified') {
                return (
                  <XStack key={`verify-${event.verification.id}`} gap="$2.5" items="flex-start">
                    <Ionicons
                      name="checkmark-circle"
                      size={16}
                      color="#1d4ed8"
                      style={{ marginTop: 1 }}
                    />
                    <YStack flex={1} gap="$1">
                      <XStack items="center" gap="$2" flexWrap="wrap">
                        <Text fontSize={12} fontWeight="700" color="#1d4ed8">
                          Verified on-site
                        </Text>
                        <Text fontSize={11} color="#1d4ed8" style={{ opacity: 0.7 }}>
                          {formatDatetime(event.time)}
                        </Text>
                      </XStack>
                      {event.verification.description && (
                        <Text fontSize={13} color="#1d4ed8" fontStyle="italic">
                          &quot;{event.verification.description}&quot;
                        </Text>
                      )}
                    </YStack>
                  </XStack>
                )
              }
              return (
                <XStack key={`resolved-${event.time}`} gap="$2.5" items="flex-start">
                  <Ionicons
                    name="checkmark-done-circle"
                    size={16}
                    color={Colors.successDark}
                    style={{ marginTop: 1 }}
                  />
                  <YStack flex={1} gap="$1">
                    <XStack items="center" gap="$2" flexWrap="wrap">
                      <Text fontSize={12} fontWeight="700" color={Colors.successDark}>
                        Resolved
                      </Text>
                      <Text fontSize={11} color={Colors.successDark} style={{ opacity: 0.7 }}>
                        {formatDatetime(event.time)}
                      </Text>
                    </XStack>
                    {event.description && (
                      <Text fontSize={13} color={Colors.successDark} fontStyle="italic">
                        &quot;{event.description}&quot;
                      </Text>
                    )}
                  </YStack>
                </XStack>
              )
            })}
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
