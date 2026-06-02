import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack } from 'tamagui'
import { stepFreePresentation, type PlatformStepFree, type StationStepFree } from '../stepFree'

type StepFreeBadgeProps = {
  value: StationStepFree | PlatformStepFree
  /** Compact badges (e.g. list rows) show the short label; default uses the full label. */
  compact?: boolean
}

/** Colour-coded wheelchair badge describing a station's or platform's step-free access. */
export const StepFreeBadge = ({ value, compact = false }: StepFreeBadgeProps) => {
  const { label, short, icon, color, background } = stepFreePresentation(value)
  return (
    <XStack
      items="center"
      gap="$1.5"
      px="$2"
      py="$1"
      style={{ backgroundColor: background, borderRadius: 6, alignSelf: 'flex-start' }}
    >
      <MaterialIcons name={icon} size={compact ? 14 : 16} color={color} />
      <Text fontSize={compact ? 12 : 13} fontWeight="600" style={{ color }}>
        {compact ? short : label}
      </Text>
    </XStack>
  )
}
