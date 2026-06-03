import { Ionicons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'

type ScreenHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  height?: number
  /** Optional action rendered at the top-right of the bar, level with the title. */
  right?: ReactNode
}

/** Blue top bar with an optional back chevron, a title, an optional subtitle, and an optional right action. */
export const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  height = 96,
  right,
}: ScreenHeaderProps) => {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#dbeafe' }}>
      <YStack style={{ height, justifyContent: 'center', paddingBottom: 8 }} px="$5" gap="$1">
        {onBack && (
          <XStack
            items="center"
            gap="$1"
            mb="$2"
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
        <XStack items="center" justify="space-between" gap="$3">
          <Heading>{title}</Heading>
          {right}
        </XStack>
        {subtitle && (
          <Text fontSize={16} color="#4a6fa5" mt="$1">
            {subtitle}
          </Text>
        )}
      </YStack>
    </SafeAreaView>
  )
}
