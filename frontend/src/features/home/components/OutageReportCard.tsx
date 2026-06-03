import { Image, Pressable } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { BASE_URL } from '@/api/client'
import type { components } from '@/api/schema.d'
import { Heading } from '@/components/Heading'
import { formatTime, isToday } from '@/lib/datetime'
import { Colors, Radii } from '@/theme'

type OutageReport = components['schemas']['OutageReportSummary']

type OutageReportCardProps = {
  report: OutageReport
  expanded: boolean
  onToggle: () => void
}

function alertLabel(report: OutageReport): string {
  const equipment = report.failure.equipment
  const conn = equipment.connection.toUpperCase()
  const type = equipment.equipment_type.name === 'lift' ? 'LIFT' : 'ESCALATOR'
  return `${type} BROKEN – ${conn}`
}

export const OutageReportCard = ({ report, expanded, onToggle }: OutageReportCardProps) => {
  const hasPhoto = !!report.image_content_type

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
          <YStack px="$4" pb="$4">
            <Text fontSize={13} color={Colors.dangerDark}>
              {report.description}
            </Text>
          </YStack>
        ) : null}
      </YStack>
    )
  }

  return (
    <Pressable onPress={onToggle}>
      <YStack style={{ backgroundColor: Colors.dangerBg, borderRadius: Radii.button }}>
        {header}
        {expanded && (
          <YStack px="$4" pb="$4" gap="$3">
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
      </YStack>
    </Pressable>
  )
}
