import { Spinner, Text, XStack, YStack } from 'tamagui'
import type { components } from '@/api/schema.d'
import { FormSection } from './FormSection'

type Equipment = components['schemas']['EquipmentSummary']

type EquipmentPickerProps = {
  label: string
  loading: boolean
  equipment: Equipment[]
  selectedId: number | null
  onSelect: (id: number) => void
  emptyText: string
}

/** Single-select list of equipment connections; shows a spinner while loading and a message when empty. */
export const EquipmentPicker = ({
  label,
  loading,
  equipment,
  selectedId,
  onSelect,
  emptyText,
}: EquipmentPickerProps) => {
  return (
    <FormSection label={label}>
      {loading ? (
        <Spinner color="#9ca3af" />
      ) : equipment.length === 0 ? (
        <Text fontSize={15} color="#9ca3af">
          {emptyText}
        </Text>
      ) : (
        equipment.map((e) => {
          const selected = selectedId === e.id
          return (
            <XStack
              key={e.id}
              items="center"
              gap="$3"
              pressStyle={{ opacity: 0.7 }}
              onPress={() => onSelect(e.id)}
              mb="$2"
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: selected ? '#2d6a4f' : '#e5e7eb',
                borderRadius: 8,
                backgroundColor: selected ? '#f0fdf4' : 'white',
              }}
            >
              <YStack
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: selected ? '#2d6a4f' : '#9ca3af',
                  backgroundColor: selected ? '#2d6a4f' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected && (
                  <Text color="white" fontSize={12} fontWeight="700">
                    ✕
                  </Text>
                )}
              </YStack>
              <Text flex={1} fontSize={15} color="#111827">
                {e.connection}
              </Text>
            </XStack>
          )
        })
      )}
    </FormSection>
  )
}
