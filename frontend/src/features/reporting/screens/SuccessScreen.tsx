import { useEffect } from 'react'
import { Text, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import type { SuccessScreenProps } from '@/navigation/types'
import { Colors, Radii } from '@/theme'

export const SuccessScreen = ({ navigation }: SuccessScreenProps) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.reset({ index: 0, routes: [{ name: 'JourneyPlanner' }] })
    }, 2000)
    return () => clearTimeout(timer)
  }, [navigation])

  return (
    <YStack flex={1} items="center" justify="center" gap="$5" style={{ backgroundColor: Colors.card }}>
      <YStack
        items="center"
        justify="center"
        style={{
          width: 120,
          height: 120,
          borderRadius: Radii.pill,
          borderWidth: 3,
          borderColor: Colors.successDark,
          backgroundColor: Colors.successBg,
        }}
      >
        <Text fontSize={52} color={Colors.successDark}>
          ✓
        </Text>
      </YStack>
      <Heading>Submitted</Heading>
    </YStack>
  )
}
