import { useEffect } from 'react'
import { Text, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import type { SuccessScreenProps } from '@/navigation/types'

export const SuccessScreen = ({ navigation }: SuccessScreenProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.reset({ index: 0, routes: [{ name: 'JourneyPlanner' }] })
    }, 2000)
    return () => clearTimeout(timer)
  }, [navigation])

  return (
    <YStack flex={1} items="center" justify="center" gap="$5" style={{ backgroundColor: 'white' }}>
      <YStack
        items="center"
        justify="center"
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          borderWidth: 3,
          borderColor: '#2d6a4f',
          backgroundColor: '#d8f3dc',
        }}
      >
        <Text fontSize={52} color="#2d6a4f">
          ✓
        </Text>
      </YStack>
      <Heading>Submitted</Heading>
    </YStack>
  )
}
