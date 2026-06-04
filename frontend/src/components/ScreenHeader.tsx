import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import { Colors, Opacity, Spacing } from '@/theme'

type ScreenHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  height?: number
  /** Optional action rendered at the top-right of the bar, level with the title. */
  right?: ReactNode
}

export const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  height = 96,
  right,
}: ScreenHeaderProps) => {
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <YStack style={[styles.inner, { height }]} px="$5" gap="$1">
        {onBack && (
          <XStack
            items="center"
            gap="$1"
            mb="$2"
            style={{ alignSelf: 'flex-start' }}
            pressStyle={{ opacity: Opacity.disabledMid }}
            onPress={onBack}
          >
            <Ionicons name="chevron-back" size={18} color={Colors.blue} />
            <Text fontSize={14} fontWeight="500" color={Colors.blue}>
              Back
            </Text>
          </XStack>
        )}
        <XStack items="center" justify="space-between" gap="$3">
          <Heading>{title}</Heading>
          {right}
        </XStack>
        {subtitle && (
          <Text fontSize={15} color={Colors.secondaryText} mt="$1">
            {subtitle}
          </Text>
        )}
      </YStack>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  inner: {
    justifyContent: 'center',
    paddingBottom: Spacing.sm,
  },
})
