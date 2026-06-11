import { Ionicons } from '@expo/vector-icons'
import { StyleSheet } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { TflBadge } from '@/components/TflBadge'
import {
  ALERT_KIND_LABEL,
  alertSeverity,
  type StationAlert,
} from '@/features/outages/stationAlerts'
import { useTheme, Borders } from '@/theme'

type Props = {
  alerts: StationAlert[]
}

/**
 * Station-level TfL advisories (bucket B): step-free loss, closures, or lift outages we can't tie
 * to a specific lift we model. Rendered above the crowd reports and clearly marked as official TfL
 * data rather than user reports.
 */
export function StationAlertBanner({ alerts }: Props) {
  const { Colors, Radii } = useTheme()
  if (alerts.length === 0) return null

  return (
    <YStack mx="$4" mt="$4" gap="$2">
      {alerts.map((alert) => {
        const danger = alertSeverity(alert) === 'danger'
        const bg = danger ? Colors.dangerBg : Colors.warningBg
        const dark = danger ? Colors.dangerDark : Colors.warningDark
        const styles = StyleSheet.create({
          card: {
            backgroundColor: bg,
            borderRadius: Radii.button,
            borderWidth: Borders.thin,
            borderColor: Colors.border,
          },
        })
        return (
          <YStack key={alert.id} px="$4" py="$3" gap="$2" style={styles.card}>
            <XStack items="center" gap="$2">
              <Ionicons name="warning" size={16} color={dark} />
              <Text flex={1} fontSize={14} fontWeight="700" color={dark} numberOfLines={2}>
                {ALERT_KIND_LABEL[alert.kind] ?? 'Service notice'}
              </Text>
              <TflBadge label="Official · TfL" />
            </XStack>
            <Text fontSize={13} color={dark}>
              {alert.message}
            </Text>
          </YStack>
        )
      })}
    </YStack>
  )
}
