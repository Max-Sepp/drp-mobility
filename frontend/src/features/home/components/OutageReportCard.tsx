import { Ionicons } from '@expo/vector-icons'
import { Image, Pressable, StyleSheet } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { BASE_URL } from '@/api/client'
import type { components } from '@/api/schema.d'
import { Heading } from '@/components/Heading'
import { formatTime, isToday } from '@/lib/datetime'
import { useTheme } from '@/theme'

type OutageReport = components['schemas']['OutageReportSummary']

type OutageReportCardProps = {
  report: OutageReport
  expanded: boolean
  onToggle: () => void
  onVerify?: () => void
  verifying?: boolean
  onResolve?: () => void
  resolving?: boolean
}

function alertLabel(report: OutageReport): string {
  const equipment = report.failure.equipment
  const conn = equipment.connection.toUpperCase()
  const type = equipment.equipment_type.name === 'lift' ? 'LIFT' : 'ESCALATOR'
  return `${type} BROKEN – ${conn}`
}

export const OutageReportCard = ({
  report,
  expanded,
  onToggle,
  onVerify,
  verifying,
  onResolve,
  resolving,
}: OutageReportCardProps) => {
  const { Colors, Radii } = useTheme()
  const hasPhoto = !!report.image_content_type
  const showActions = (onVerify && !report.verified) || !!onResolve

  const actionRow = showActions ? (
    <XStack px="$4" pb="$4" gap="$2">
      {onVerify && !report.verified && (
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
            {verifying ? 'Verifying…' : 'Verify on-site'}
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

  const header = (
    <XStack p="$4" items="center" gap="$3">
      <YStack
        style={{
          width: 36,
          height: 36,
          borderRadius: Radii.pill,
          backgroundColor: Colors.dangerDark,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text color={Colors.card} fontWeight="700" fontSize={18}>
          !
        </Text>
      </YStack>
      <YStack flex={1}>
        <Heading fontSize={14} color={Colors.dangerDark}>
          {alertLabel(report)}
        </Heading>
        <Text fontSize={12} color={Colors.dangerDark} mt="$1">
          reported at {formatTime(report.breakdown_time)}
          {isToday(report.breakdown_time) ? ' today' : ''}
        </Text>
        {report.reporter_role === 'trusted' && (
          <XStack items="center" gap="$1" mt="$1">
            <Ionicons name="shield-checkmark" size={12} color="#15803d" />
            <Text fontSize={12} fontWeight="600" color="#15803d">
              Trusted reporter
            </Text>
          </XStack>
        )}
        {report.verified && (
          <XStack items="center" gap="$1" mt="$1">
            <Ionicons name="shield-checkmark" size={12} color="#1d4ed8" />
            <Text fontSize={12} fontWeight="600" color="#1d4ed8">
              Verified on-site
            </Text>
          </XStack>
        )}
      </YStack>
      {hasPhoto && (
        <Text fontSize={12} color={Colors.dangerDark}>
          {expanded ? '▲' : '▼'}
        </Text>
      )}
    </XStack>
  )

  if (!hasPhoto) {
    return (
      <YStack style={{ backgroundColor: Colors.dangerBg, borderRadius: Radii.button }}>
        {header}
        {report.description ? (
          <YStack px="$4" pb={showActions ? '$2' : '$4'}>
            <Text fontSize={13} color={Colors.dangerDark}>
              {report.description}
            </Text>
          </YStack>
        ) : null}
        {actionRow}
      </YStack>
    )
  }

  return (
    <Pressable onPress={onToggle}>
      <YStack style={{ backgroundColor: Colors.dangerBg, borderRadius: Radii.button }}>
        {header}
        {expanded && (
          <YStack px="$4" pb={showActions ? '$2' : '$4'} gap="$3">
            {report.description ? (
              <Text fontSize={13} color={Colors.dangerDark}>
                {report.description}
              </Text>
            ) : null}
            <Image
              source={{ uri: `${BASE_URL}/outage-reports/${report.id}/image` }}
              style={{ width: '100%', height: 180, borderRadius: Radii.small }}
              resizeMode="cover"
            />
          </YStack>
        )}
        {actionRow}
      </YStack>
    </Pressable>
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
