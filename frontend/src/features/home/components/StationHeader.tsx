import { Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'

type StationHeaderProps = {
  station: string
  onPress: () => void
}

/** Home-screen header showing the current station and inviting the user to change it. */
export const StationHeader = ({ station, onPress }: StationHeaderProps) => {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#dbeafe' }}>
      <Pressable onPress={onPress}>
        <YStack px="$5" py="$3">
          <XStack items="center" gap="$2">
            <Heading fontSize={26} color="#1e3a5f">
              {station}
            </Heading>
            <Text fontSize={20} color="#1e3a5f" style={{ marginTop: 4 }}>
              ▾
            </Text>
          </XStack>
          <Text fontSize={12} color="#4a6fa5" mt="$1">
            tap to change station
          </Text>
        </YStack>
      </Pressable>
    </SafeAreaView>
  )
}
