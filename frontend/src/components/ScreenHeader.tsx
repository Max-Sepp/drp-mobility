import { Ionicons } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'

type ScreenHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  height?: number
}

/** Blue top bar with an optional back chevron, a title, and an optional subtitle. */
export default function ScreenHeader({ title, subtitle, onBack, height = 96 }: ScreenHeaderProps) {
  return (
    <SafeAreaView edges={['top']} style={{ backgroundColor: '#dbeafe' }}>
      <YStack style={{ height, justifyContent: 'center', paddingBottom: 8 }} px="$5" gap="$1">
        {onBack && (
          <XStack items="center" gap="$1" mb="$2" style={{ alignSelf: 'flex-start' }} pressStyle={{ opacity: 0.6 }} onPress={onBack}>
            <Ionicons name="chevron-back" size={18} color="#2563eb" />
            <Text fontSize={14} fontWeight="500" color="#2563eb">Back</Text>
          </XStack>
        )}
        <Text fontSize={22} fontWeight="700" color="#1a1a1a">{title}</Text>
        {subtitle && <Text fontSize={16} color="#4a6fa5" mt="$1">{subtitle}</Text>}
      </YStack>
    </SafeAreaView>
  )
}
