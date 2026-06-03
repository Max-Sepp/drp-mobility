import { Ionicons } from '@expo/vector-icons'
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
  /** Shown only when the screen was pushed (e.g. from a journey) and can be dismissed. */
  onBack?: () => void
}

/** Station-screen header showing the station, its step-free status, and a change affordance. */
export const StationHeader = ({ station, stepFree, onPress, onBack }: StationHeaderProps) => {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#dbeafe' }}>
      {onBack && (
        <XStack
          items="center"
          gap="$1"
          px="$5"
          pt="$2"
          style={{ alignSelf: 'flex-start' }}
          pressStyle={{ opacity: 0.6 }}
          onPress={onBack}
        >
          <Ionicons name="chevron-back" size={18} color="#2563eb" />
          <Text fontSize={14} fontWeight="500" color="#2563eb">
            Back
          </Text>
        </XStack>
      )}
      <Pressable onPress={onPress}>
        <YStack px="$5" py="$3" gap="$2">
          <XStack items="center" gap="$2">
            <Heading fontSize={26} color="#1e3a5f">
              {station}
            </Heading>
            <Text fontSize={20} color="#1e3a5f" style={{ marginTop: 4 }}>
              ▾
            </Text>
          </XStack>
          {stepFree && <StepFreeBadge value={stepFree} />}
          <Text fontSize={12} color="#4a6fa5">
            tap to change station
          </Text>
        </YStack>
      </Pressable>
    </SafeAreaView>
  )
}
