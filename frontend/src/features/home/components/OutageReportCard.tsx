import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { Image, StyleSheet } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { BASE_URL } from '@/api/client'
import type { components } from '@/api/schema.d'
import { formatDatetime } from '@/lib/datetime'
import { useTheme, Borders, Spacing } from '@/theme'

type OutageReport = components['schemas']['OutageReportSummary']

type OutageReportCardProps = {
  /** All active reports under the same failure, sorted oldest-first. */
  reports: OutageReport[]
  expanded: boolean
  onToggle: () => void
}

function alertLabel(report: OutageReport): string {
  const equipment = report.failure.equipment
  const type = equipment.equipment_type.name === 'lift' ? 'Lift' : 'Escalator'
  return `${type} broken – ${equipment.connection}`
}

export const OutageReportCard = ({ reports, expanded, onToggle }: OutageReportCardProps) => {
  const { Colors, Radii } = useTheme()

  const times = reports.map((r) => r.breakdown_time).sort()
  const firstReported = times[0]
  const lastReported = times[times.length - 1]
  const reportCount = reports.length
  const hasTrustedReporter = reports.some((r) => r.reporter_role === 'trusted')
  const hasAnyContent = reports.some((r) => !!r.description || !!r.image_content_type)

  const styles = StyleSheet.create({
    card: {
      backgroundColor: Colors.dangerBg,
      borderRadius: Radii.button,
      borderWidth: Borders.thin,
      borderColor: Colors.border,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: Colors.dangerBorder,
      opacity: 0.5,
    },
  })

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
            backgroundColor: Colors.dangerDark,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Text color={Colors.card} fontWeight="700" fontSize={16}>
            !
          </Text>
        </YStack>

        <YStack flex={1} gap="$0.5">
          <Text fontSize={14} fontWeight="700" color={Colors.dangerDark} numberOfLines={2}>
            {alertLabel(reports[0])}
          </Text>
          <Text fontSize={12} color={Colors.dangerDark}>
            first reported {formatDatetime(firstReported)}
          </Text>
          {hasTrustedReporter && (
            <XStack items="center" gap="$1" mt="$0.5">
              <Ionicons name="shield-checkmark" size={11} color="#15803d" />
              <Text fontSize={11} fontWeight="600" color="#15803d">
                Trusted reporter
              </Text>
            </XStack>
          )}
        </YStack>

        <YStack items="flex-end" gap="$1" style={{ flexShrink: 0 }}>
          {reportCount > 1 && (
            <Text fontSize={11} fontWeight="700" color={Colors.dangerDark}>
              {reportCount} reports
            </Text>
          )}
          <MaterialIcons
            name={expanded ? 'expand-less' : 'expand-more'}
            size={22}
            color={Colors.dangerDark}
          />
        </YStack>
      </XStack>

      {/* Expanded detail */}
      {expanded && (
        <YStack>
          <YStack style={[styles.divider, { marginHorizontal: Spacing.lg }]} />
          <YStack px="$4" pt="$3" pb="$4" gap="$2">
            {/* Timing summary */}
            <YStack gap="$1">
              <XStack gap="$2">
                <Text fontSize={12} fontWeight="700" color={Colors.dangerDark}>
                  First reported:
                </Text>
                <Text fontSize={12} color={Colors.dangerDark}>
                  {formatDatetime(firstReported)}
                </Text>
              </XStack>
              {reportCount > 1 && (
                <XStack gap="$2">
                  <Text fontSize={12} fontWeight="700" color={Colors.dangerDark}>
                    Last reported:
                  </Text>
                  <Text fontSize={12} color={Colors.dangerDark}>
                    {formatDatetime(lastReported)}
                  </Text>
                </XStack>
              )}
              <XStack gap="$2">
                <Text fontSize={12} fontWeight="700" color={Colors.dangerDark}>
                  Total reports:
                </Text>
                <Text fontSize={12} color={Colors.dangerDark}>
                  {reportCount}
                </Text>
              </XStack>
            </YStack>

            {/* Individual report descriptions and images */}
            {hasAnyContent &&
              reports.map((report) => {
                if (!report.description && !report.image_content_type) return null
                return (
                  <YStack key={report.id} gap="$2" mt="$1">
                    <YStack style={[styles.divider, { marginVertical: 2 }]} />
                    {report.description && (
                      <Text fontSize={13} color={Colors.dangerDark} fontStyle="italic">
                        &quot;{report.description}&quot;
                      </Text>
                    )}
                    {report.image_content_type && (
                      <Image
                        source={{ uri: `${BASE_URL}/outage-reports/${report.id}/image` }}
                        style={{ width: '100%', height: 180, borderRadius: Radii.small }}
                        resizeMode="cover"
                      />
                    )}
                    <XStack items="center" gap="$2">
                      <Text fontSize={11} color={Colors.dangerDark} style={{ opacity: 0.7 }}>
                        Reported {formatDatetime(report.breakdown_time)}
                      </Text>
                      {report.reporter_role === 'trusted' && (
                        <XStack items="center" gap="$1">
                          <Ionicons name="shield-checkmark" size={10} color="#15803d" />
                          <Text fontSize={11} fontWeight="600" color="#15803d">
                            Trusted
                          </Text>
                        </XStack>
                      )}
                    </XStack>
                  </YStack>
                )
              })}
          </YStack>
        </YStack>
      )}
    </YStack>
  )
}
