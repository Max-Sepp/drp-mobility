import { Text, XStack, YStack } from 'tamagui'

type StationListItemProps = {
  name: string
  lines: string[]
  selected: boolean
  onPress: () => void
}

/** One selectable station row: a radio indicator, the station name, and its lines. */
export const StationListItem = ({ name, lines, selected, onPress }: StationListItemProps) => {
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
      <YStack>
        <Text fontSize={16} fontWeight="600" color="#111827">
          {name}
        </Text>
        <Text fontSize={13} color="#6b7280" mt="$1">
          {lines.join(', ')}
        </Text>
      </YStack>
    </XStack>
  )
}
