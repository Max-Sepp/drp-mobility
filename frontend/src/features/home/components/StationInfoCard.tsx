import { useMemo } from 'react'
import { Text, XStack, YStack } from 'tamagui'
import { LineChips, stationLines, type StationDetail } from '@/features/stations'
import { useTheme, Borders, Spacing } from '@/theme'

type Props = { station: StationDetail }

export const StationInfoCard = ({ station }: Props) => {
  const { Colors, Radii } = useTheme()
  const lines = useMemo(() => stationLines(station), [station])

  const zonesText = useMemo(() => {
    const z = station.zones ?? []
    if (z.length === 0) return null
    return z.length === 1 ? `Zone ${z[0]}` : `Zones ${z.join('/')}`
  }, [station.zones])

  if (lines.length === 0 && !zonesText) return null

  return (
    <YStack
      mx="$4"
      mt="$4"
      style={{
        backgroundColor: Colors.card,
        borderRadius: Radii.button,
        borderWidth: Borders.thin,
        borderColor: Colors.border,
        padding: Spacing.lg,
      }}
    >
      <XStack justify="space-between" items="flex-start" gap="$3">
        <YStack flex={1} gap="$1.5">
          <Text fontSize={12} fontWeight="700" letterSpacing={0.5} color={Colors.secondaryText}>
            LINES
          </Text>
          <LineChips lines={lines} />
        </YStack>
        {zonesText && (
          <YStack gap="$1.5" items="flex-end">
            <Text fontSize={12} fontWeight="700" letterSpacing={0.5} color={Colors.secondaryText}>
              ZONE
            </Text>
            <XStack
              px="$2"
              py="$1"
              style={{ backgroundColor: Colors.blueBg, borderRadius: Radii.xs }}
            >
              <Text fontSize={12} fontWeight="700" color={Colors.blue}>
                {zonesText}
              </Text>
            </XStack>
          </YStack>
        )}
      </XStack>
    </YStack>
  )
}
