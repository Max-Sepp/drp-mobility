import { Text, XStack, YStack } from 'tamagui'
import type { StationStepFree } from '../stepFree'
import { LineChips } from './LineChips'
import { StepFreeBadge } from './StepFreeBadge'
import { Borders, Colors, Opacity, Radii } from '@/theme'

type StationListItemProps = {
  name: string
  lines: string[]
  stepFree: StationStepFree
  selected: boolean
  onPress: () => void
}

export const StationListItem = ({ name, lines, stepFree, selected, onPress }: StationListItemProps) => {
  return (
    <XStack
      items="center"
      py="$4"
      px="$5"
      gap="$3.5"
      pressStyle={{ opacity: Opacity.pressed }}
      onPress={onPress}
      style={{ backgroundColor: selected ? Colors.successBg : Colors.card }}
    >
      <YStack
        style={{
          width: 24,
          height: 24,
          borderRadius: Radii.pill,
          borderWidth: Borders.thick,
          borderColor: selected ? Colors.successDark : Colors.placeholderText,
          backgroundColor: selected ? Colors.successDark : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && (
          <Text color={Colors.card} fontSize={13} fontWeight="700">
            ✓
          </Text>
        )}
      </YStack>
      <YStack flex={1} gap="$1.5">
        <Text fontSize={16} fontWeight="600" color={Colors.text}>
          {name}
        </Text>
        <LineChips lines={lines} />
        <StepFreeBadge value={stepFree} compact />
      </YStack>
    </XStack>
  )
}
