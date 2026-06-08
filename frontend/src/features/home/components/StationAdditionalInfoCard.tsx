import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import type { StationDetail } from '@/features/stations'
import { useTheme, Borders, Spacing } from '@/theme'

type Props = { station: StationDetail }

type BulletItem = {
  icon: React.ComponentProps<typeof MaterialIcons>['name']
  label: string
  color: string
}

export const StationAdditionalInfoCard = ({ station }: Props) => {
  const { Colors, Radii } = useTheme()

  const items: BulletItem[] = []

  // WiFi — always listed
  items.push(
    station.wifi
      ? { icon: 'wifi', label: 'WiFi available', color: Colors.success }
      : { icon: 'wifi-off', label: 'No WiFi', color: Colors.danger },
  )

  // Toilets
  if (station.has_accessible_toilets) {
    items.push({ icon: 'accessible', label: 'Accessible toilets', color: Colors.success })
  } else if (station.has_toilets) {
    items.push({ icon: 'wc', label: 'Toilets available (not accessible)', color: Colors.secondaryText })
  } else {
    items.push({ icon: 'wc', label: 'No toilet facilities', color: Colors.secondaryText })
  }

  // Optional amenities — only when present
  if (station.blue_badge_parking) {
    items.push({ icon: 'local-parking', label: 'Blue badge parking', color: Colors.blue })
  }
  if (station.taxi_rank) {
    items.push({ icon: 'local-taxi', label: 'Taxi rank', color: Colors.blue })
  }

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
        gap: Spacing.md,
      }}
    >
      <Text fontSize={15} fontWeight="700" color={Colors.text}>
        Additional information
      </Text>
      <YStack gap="$2.5">
        {items.map((item) => (
          <XStack key={item.label} items="center" gap="$2.5">
            <MaterialIcons name={item.icon} size={18} color={item.color} />
            <Text fontSize={14} color={Colors.text}>
              {item.label}
            </Text>
          </XStack>
        ))}
      </YStack>
    </YStack>
  )
}
