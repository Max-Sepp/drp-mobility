import { Spinner, Text, XStack, YStack } from 'tamagui'
import type { components } from '@/api/schema.d'
import { formatConnection } from '@/lib/connection'
import { FormSection } from '@/features/reporting/components/FormSection'
import { useTheme, Borders, Opacity } from '@/theme'

type Equipment = components['schemas']['EquipmentSummary']

type EquipmentPickerProps = {
  label: string
  loading: boolean
  equipment: Equipment[]
  selectedId: number | null
  onSelect: (id: number) => void
  emptyText: string
  // Equipment ids relevant to the rider's current journey (the lines they're using at this
  // station). Marked rows get an "On your route" badge; ordering is handled by the caller.
  highlightedIds?: Set<number>
}

export const EquipmentPicker = ({
  label,
  loading,
  equipment,
  selectedId,
  onSelect,
  emptyText,
  highlightedIds,
}: EquipmentPickerProps) => {
  const { Colors, Radii } = useTheme()
  return (
    <FormSection label={label}>
      {loading ? (
        <Spinner color={Colors.secondaryText} />
      ) : equipment.length === 0 ? (
        <Text fontSize={15} color={Colors.secondaryText}>
          {emptyText}
        </Text>
      ) : (
        equipment.map((e) => {
          const selected = selectedId === e.id
          const highlighted = highlightedIds?.has(e.id) ?? false
          return (
            <XStack
              key={e.id}
              items="center"
              gap="$3"
              pressStyle={{ opacity: Opacity.pressed }}
              onPress={() => onSelect(e.id)}
              mb="$2"
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderWidth: highlighted && !selected ? Borders.medium : Borders.thin,
                borderColor: selected
                  ? Colors.successDark
                  : highlighted
                    ? Colors.blue
                    : Colors.border,
                borderRadius: Radii.small,
                backgroundColor: selected ? Colors.successBg : Colors.card,
              }}
            >
              <YStack
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: Radii.xs,
                  borderWidth: Borders.thick,
                  borderColor: selected ? Colors.blue : Colors.placeholderText,
                  backgroundColor: selected ? Colors.blue : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected && (
                  <Text color={Colors.card} fontSize={12} fontWeight="700">
                    ✓
                  </Text>
                )}
              </YStack>
              <Text flex={1} fontSize={15} color={Colors.text}>
                {formatConnection(e.connection, e.equipment_type.name)}
              </Text>
              {highlighted && (
                <Text
                  fontSize={12}
                  fontWeight="700"
                  color={Colors.card}
                  style={{
                    backgroundColor: Colors.blue,
                    paddingVertical: 3,
                    paddingHorizontal: 8,
                    borderRadius: Radii.pill,
                    overflow: 'hidden',
                  }}
                >
                  On your route
                </Text>
              )}
            </XStack>
          )
        })
      )}
    </FormSection>
  )
}
