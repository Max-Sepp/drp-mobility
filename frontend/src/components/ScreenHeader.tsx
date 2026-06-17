import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { StyleSheet, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import { useTheme, Spacing } from '@/theme'

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
  height = 72,
  right,
}: ScreenHeaderProps) => {
  const { Colors } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: Colors.card,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: Colors.separator,
        },
        inner: {
          justifyContent: 'center',
        },
        backButton: {
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [Colors],
  )
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <YStack style={[styles.inner, { height }]} px="$5" gap="$1">
        <XStack items="center" gap="$3">
          {onBack && (
            <TouchableOpacity
              onPress={onBack}
              activeOpacity={0.75}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Ionicons name="chevron-back" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>
          )}
          <YStack flex={1} gap="$1">
            <Heading>{title}</Heading>
            {subtitle && (
              <Text fontSize={15} color={Colors.secondaryText}>
                {subtitle}
              </Text>
            )}
          </YStack>
          {right}
        </XStack>
      </YStack>
    </SafeAreaView>
  )
}
