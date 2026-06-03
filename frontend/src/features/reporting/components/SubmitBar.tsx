import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Spinner, Text, YStack } from 'tamagui'
import { Borders, Colors, Heights, Opacity, Radii } from '@/theme'

type SubmitBarProps = {
  onPress: () => void
  submitting?: boolean
  label?: string
}

export const SubmitBar = ({ onPress, submitting = false, label = 'Submit' }: SubmitBarProps) => {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <YStack
        mx="$5"
        my="$3"
        items="center"
        justify="center"
        pressStyle={{ opacity: Opacity.pressedLight }}
        onPress={submitting ? undefined : onPress}
        opacity={submitting ? Opacity.disabledMid : 1}
        style={{ backgroundColor: Colors.text, borderRadius: Radii.button, height: Heights.button }}
      >
        {submitting ? (
          <Spinner color={Colors.card} />
        ) : (
          <Text color={Colors.card} fontSize={16} fontWeight="700">
            {label}
          </Text>
        )}
      </YStack>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: Colors.card,
    borderTopWidth: Borders.thin,
    borderTopColor: Colors.border,
  },
})
