import { Text, XStack, YStack } from 'tamagui'
import type { StationStepFree } from '../stepFree'
import { LineChips } from './LineChips'
import { StepFreeBadge } from './StepFreeBadge'

type StationListItemProps = {
  name: string
  lines: string[]
  stepFree: StationStepFree
  selected: boolean
  onPress: () => void
}

/** One selectable station row: a radio indicator, the station name, its lines, and a step-free badge. */
export const StationListItem = ({
  name,
  lines,
  stepFree,
  selected,
  onPress,
}: StationListItemProps) => {
  return (
    <XStack
      items="center"
      py="$4"
      px="$5"
      gap="$3.5"
      pressStyle={{ opacity: 0.7 }}
      onPress={onPress}
      style={{ backgroundColor: selected ? '#f0fdf4' : 'white' }}
    >
      <YStack
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          borderWidth: 2,
          borderColor: selected ? '#2d6a4f' : '#9ca3af',
          backgroundColor: selected ? '#2d6a4f' : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected && (
          <Text color="white" fontSize={13} fontWeight="700">
            ✓
          </Text>
        )}
      </YStack>
      <YStack flex={1} gap="$1.5">
        <Text fontSize={16} fontWeight="600" color="#111827">
          {name}
        </Text>
        <LineChips lines={lines} />
        <StepFreeBadge value={stepFree} compact />
      </YStack>
    </XStack>
  )
}
