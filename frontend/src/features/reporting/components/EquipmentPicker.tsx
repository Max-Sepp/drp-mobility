import { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import type { components } from '@/api/schema.d'
import { connectionBody, connectionDirections, type Direction } from '@/lib/connection'
import { FormSection } from '@/features/reporting/components/FormSection'
import { useTheme, Borders, Opacity } from '@/theme'

type Equipment = components['schemas']['EquipmentSummary']

// Above this many options, show the direction filter chips. Small stations stay clean.
const FILTER_THRESHOLD = 6

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

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
  const [activeDir, setActiveDir] = useState<Direction | null>(null)

  // Reset the filter when the picker switches between lift and escalator (or stations).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveDir(null)
  }, [label])

  const showFilters = equipment.length >= FILTER_THRESHOLD
  const directions = useMemo(
    () => connectionDirections(equipment.map((e) => e.connection)),
    [equipment],
  )

  const filtered = useMemo(() => {
    if (!activeDir) return equipment
    return equipment.filter((e) => e.connection.toLowerCase().includes(activeDir))
  }, [equipment, activeDir])

  const renderChip = (chipLabel: string, active: boolean, onPress: () => void) => (
    <Text
      key={chipLabel}
      onPress={onPress}
      pressStyle={{ opacity: Opacity.pressed }}
      fontSize={13}
      fontWeight="600"
      color={active ? Colors.card : Colors.text}
      style={{
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: Radii.pill,
        borderWidth: Borders.thin,
        borderColor: active ? Colors.blue : Colors.border,
        backgroundColor: active ? Colors.blue : Colors.card,
        overflow: 'hidden',
      }}
    >
      {chipLabel}
    </Text>
  )

  return (
    <FormSection label={label}>
      {loading ? (
        <Spinner color={Colors.secondaryText} />
      ) : equipment.length === 0 ? (
        <Text fontSize={15} color={Colors.secondaryText}>
          {emptyText}
        </Text>
      ) : (
        <>
          {showFilters && directions.length > 0 && (
            <XStack gap="$2" flexWrap="wrap" mb="$3">
              {renderChip('All', activeDir === null, () => setActiveDir(null))}
              {directions.map((d) =>
                renderChip(capitalise(d), activeDir === d, () =>
                  setActiveDir(activeDir === d ? null : d),
                ),
              )}
            </XStack>
          )}

          {filtered.length === 0 ? (
            <Text fontSize={15} color={Colors.secondaryText}>
              No {label.toLowerCase().includes('escalator') ? 'escalators' : 'lifts'} match your
              filter.
            </Text>
          ) : (
            filtered.map((e) => {
              const selected = selectedId === e.id
              const highlighted = highlightedIds?.has(e.id) ?? false
              const isLift = e.equipment_type.name === 'lift'
              const ends = connectionBody(e.connection, e.equipment_type.name)
                .split(/↔|→/)
                .map((s) => s.trim())
                .filter(Boolean)
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
                    borderColor: selected || highlighted ? Colors.blue : Colors.border,
                    borderRadius: Radii.small,
                    backgroundColor: selected ? Colors.blueBg : Colors.card,
                  }}
                >
                  <YStack
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: Radii.circle,
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

                  <YStack flex={1} gap="$1">
                    {/* The connector is part of the text flow (joined to the last word by a
                        non-breaking space) so it stays at the end of the line when end A wraps,
                        rather than dropping onto a line of its own. */}
                    <Text fontSize={15} color={Colors.text}>
                      {ends[0] ?? ''}
                      {ends.length > 1 && (
                        <Text
                          color={Colors.secondaryText}
                        >{`\u00A0\u00A0${isLift ? '↔' : '→'}`}</Text>
                      )}
                    </Text>
                    {ends.length > 1 && (
                      <Text fontSize={15} color={Colors.text}>
                        {ends[1]}
                      </Text>
                    )}
                  </YStack>

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
        </>
      )}
    </FormSection>
  )
}
