import { Ionicons } from '@expo/vector-icons'
import { Image, Pressable } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
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
}

function alertLabel(report: OutageReport): string {
  const equipment = report.failure.equipment
  if (equipment.equipment_type.name === 'overcrowding') return 'OVERCROWDING REPORTED'
  const conn = equipment.connection.toUpperCase()
  const type = equipment.equipment_type.name === 'lift' ? 'LIFT' : 'ESCALATOR'
  return `${type} BROKEN – ${conn}`
}

export const OutageReportCard = ({ report, expanded, onToggle }: OutageReportCardProps) => {
  const { Colors, Radii } = useTheme()
  const hasPhoto = !!report.image_content_type
  const isOvercrowding = report.failure.equipment.equipment_type.name === 'overcrowding'
  const bgColor = isOvercrowding ? Colors.warningBg : Colors.dangerBg
  const darkColor = isOvercrowding ? Colors.warningDark : Colors.dangerDark

  const header = (
    <XStack p="$4" items="center" gap="$3">
      <YStack
        style={{
          width: 36,
          height: 36,
          borderRadius: Radii.pill,
          backgroundColor: darkColor,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text color={Colors.card} fontWeight="700" fontSize={18}>
          !
        </Text>
      </YStack>
      <YStack flex={1}>
        <Heading fontSize={14} color={darkColor}>
          {alertLabel(report)}
        </Heading>
        <Text fontSize={12} color={darkColor} mt="$1">
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
      </YStack>
      {hasPhoto && (
        <Text fontSize={12} color={darkColor}>
          {expanded ? '▲' : '▼'}
        </Text>
      )}
    </XStack>
  )

  if (!hasPhoto) {
    return (
      <YStack style={{ backgroundColor: bgColor, borderRadius: Radii.button }}>
        {header}
        {report.description ? (
          <YStack px="$4" pb="$4">
            <Text fontSize={13} color={darkColor}>
              {report.description}
            </Text>
          </YStack>
        ) : null}
      </YStack>
    )
  }

  return (
    <Pressable onPress={onToggle}>
      <YStack style={{ backgroundColor: bgColor, borderRadius: Radii.button }}>
        {header}
        {expanded && (
          <YStack px="$4" pb="$4" gap="$3">
            {report.description ? (
              <Text fontSize={13} color={darkColor}>
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
