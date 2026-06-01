import { SafeAreaView } from 'react-native-safe-area-context'
import { Spinner, Text, YStack } from 'tamagui'

type SubmitBarProps = {
  onPress: () => void
  submitting?: boolean
  label?: string
}

/** Fixed bottom bar holding the primary submit button; shows a spinner while submitting. */
export const SubmitBar = ({ onPress, submitting = false, label = 'Submit' }: SubmitBarProps) => {
  return (
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
      <YStack
        mx="$5"
        my="$3"
        items="center"
        justify="center"
        pressStyle={{ opacity: 0.8 }}
        onPress={submitting ? undefined : onPress}
        opacity={submitting ? 0.6 : 1}
        style={{ backgroundColor: '#111827', borderRadius: 10, height: 52 }}
      >
        {submitting ? (
          <Spinner color="white" />
        ) : (
          <Text color="white" fontSize={16} fontWeight="700">{label}</Text>
        )}
      </YStack>
    </SafeAreaView>
  )
}
