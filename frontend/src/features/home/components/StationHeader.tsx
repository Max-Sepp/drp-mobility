import { Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import { StepFreeBadge } from '@/features/stations'
import type { StationStepFree } from '@/features/stations/stepFree'

type StationHeaderProps = {
  station: string
  stepFree?: StationStepFree
  onPress: () => void
}

/** Home-screen header showing the current station, its step-free status, and a change affordance. */
export const StationHeader = ({ station, stepFree, onPress }: StationHeaderProps) => {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#dbeafe' }}>
      <Pressable onPress={onPress}>
        <YStack px="$5" py="$3" gap="$2">
          <XStack items="center" gap="$2">
            <Heading fontSize={26} color="#1e3a5f">{station}</Heading>
            <Text fontSize={20} color="#1e3a5f" style={{ marginTop: 4 }}>▾</Text>
          </XStack>
          {stepFree && <StepFreeBadge value={stepFree} />}
          <Text fontSize={12} color="#4a6fa5">tap to change station</Text>
        </YStack>
      </Pressable>
    </SafeAreaView>
  )
}
