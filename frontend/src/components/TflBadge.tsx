import { Ionicons } from '@expo/vector-icons'
import { Text, XStack } from 'tamagui'
import { useTheme } from '@/theme'

/**
 * A small pill marking a piece of status as coming from TfL's official feed rather than a
 * crowd-sourced report. Used on station alerts and on TfL-sourced outage cards so the two are
 * never confused.
 */
export function TflBadge({ label = 'TfL' }: { label?: string }) {
  const { Colors, Radii } = useTheme()
  return (
    <XStack
      items="center"
      gap="$1"
      px="$2"
      py="$1"
      style={{ backgroundColor: Colors.blue, borderRadius: Radii.xs, flexShrink: 0 }}
    >
      <Ionicons name="information-circle" size={11} color={Colors.card} />
      <Text fontSize={11} fontWeight="700" color={Colors.card}>
        {label}
      </Text>
    </XStack>
  )
}
