import { Separator, Text, XStack, YStack } from 'tamagui'
import { StepFreeBadge, type PlatformDetail } from '@/features/stations'

type PlatformAccessCardProps = {
  platforms: PlatformDetail[]
}

/** Per-platform step-free breakdown for the selected station: which platforms are accessible
 * and which are not. Surfaces the cases where some platforms differ from the station summary. */
export const PlatformAccessCard = ({ platforms }: PlatformAccessCardProps) => {
  if (platforms.length === 0) return null

  return (
    <YStack mx="$4" mt="$4" gap="$2" style={{ backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 }}>
      <Text fontSize={15} fontWeight="700" color="#111827">Platform access</Text>
      <YStack>
        {platforms.map((platform, i) => (
          <YStack key={platform.name}>
            {i > 0 && <Separator borderColor="$borderColor" my="$2.5" />}
            <XStack items="center" justify="space-between" gap="$3">
              <YStack flex={1} gap="$0.5">
                <Text fontSize={14} fontWeight="600" color="#111827">{platform.name}</Text>
                {platform.lines.length > 0 && (
                  <Text fontSize={12} color="#6b7280">{platform.lines.join(', ')}</Text>
                )}
              </YStack>
              <StepFreeBadge value={platform.step_free} compact />
            </XStack>
          </YStack>
        ))}
      </YStack>
    </YStack>
  )
}
