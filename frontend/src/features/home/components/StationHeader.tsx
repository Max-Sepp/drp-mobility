import { Ionicons } from '@expo/vector-icons'
import { useMemo } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import { StepFreeBadge } from '@/features/stations'
import type { StationStepFree } from '@/features/stations/stepFree'
import { useTheme, Opacity, Spacing, Typography } from '@/theme'

type StationHeaderProps = {
  station: string
  stepFree?: StationStepFree
  onPress: () => void
  onBack?: () => void
}

export const StationHeader = ({ station, stepFree, onPress, onBack }: StationHeaderProps) => {
  const { Colors } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          backgroundColor: Colors.card,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: Colors.separator,
          paddingBottom: Spacing.xs,
        },
      }),
    [Colors],
  )
  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {onBack && (
        <XStack
          items="center"
          gap="$1"
          px="$5"
          pt="$2"
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
      <Pressable onPress={onPress}>
        <YStack px="$5" py="$3" gap="$2">
          <XStack items="center" gap="$2">
            <Heading fontSize={Typography.largeTitle.fontSize} color={Colors.text}>
              {station}
            </Heading>
            <Text fontSize={20} color={Colors.secondaryText} style={{ marginTop: 4 }}>
              ▾
            </Text>
          </XStack>
          {stepFree && <StepFreeBadge value={stepFree} />}
          <Text fontSize={Typography.caption.fontSize} color={Colors.secondaryText}>
            tap to change station
          </Text>
        </YStack>
      </Pressable>
    </SafeAreaView>
  )
}
