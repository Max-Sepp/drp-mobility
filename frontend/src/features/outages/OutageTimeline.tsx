// The merged event timeline for one outage (failure): every user report, every on-site
// verification, and (once fixed) the resolution, interleaved newest-first. Shared by the home
// station card and the journey "alerts on this route" card so both read identically.

import { Ionicons } from '@expo/vector-icons'
import { Image } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { BASE_URL } from '@/api/client'
import type { components } from '@/api/schema.d'
import { formatDatetime } from '@/lib/datetime'
import { useTheme } from '@/theme'

type OutageReport = components['schemas']['OutageReportSummary']
type Verification = components['schemas']['OutageReportVerificationSchema']

type TimelineEvent =
  | { kind: 'reported'; time: string; report: OutageReport }
  | { kind: 'verified'; time: string; verification: Verification }
  | { kind: 'resolved'; time: string; description: string | null }

type Props = {
  reports: OutageReport[]
  verifications: Verification[]
  /** Set once the outage is resolved; adds a "Resolved" entry to the timeline. */
  resolvedAt?: string | null
  resolutionDescription?: string | null
}

export const OutageTimeline = ({
  reports,
  verifications,
  resolvedAt,
  resolutionDescription,
}: Props) => {
  const { Colors, Radii } = useTheme()

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
    ...(resolvedAt
      ? [
          {
            kind: 'resolved' as const,
            time: resolvedAt,
            description: resolutionDescription ?? null,
          },
        ]
      : []),
  ].sort((a, b) => b.time.localeCompare(a.time))

  return (
    <YStack gap="$3">
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
  )
}
