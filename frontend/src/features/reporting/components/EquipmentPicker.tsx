import { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import type { components } from '@/api/schema.d'
import { connectionBody, connectionDirections, type Direction } from '@/lib/connection'
import { FormSection } from '@/features/reporting/components/FormSection'
import { LineChips, type PlatformDetail } from '@/features/stations'
import { useTheme, Borders, Opacity } from '@/theme'

type Equipment = components['schemas']['EquipmentSummary']

function linesForEquipment(connection: string, platforms: PlatformDetail[]): string[] {
  const conn = connection.toLowerCase()
  // Strip the "Lift X: " prefix then split on the arrow so we check each endpoint separately.
  // This prevents a direction word in one endpoint (e.g. "Westbound hall") from falsely matching
  // a numbered platform in the other endpoint ("Westbound Platform 1").
  const body = conn.includes(':') ? conn.slice(conn.indexOf(':') + 1) : conn
  const segments = body.split(/↔|→/).map((s) => s.trim())

  const lines = new Set<string>()
  for (const p of platforms) {
    const name = p.name.toLowerCase()
    const numMatch = name.match(/(\d+)$/)
    const dirMatch = name.match(/^(northbound|southbound|eastbound|westbound)/i)

    for (const seg of segments) {
      // Exact substring (e.g. "Westbound Platform 1" literally in segment)
      if (seg.includes(name)) {
        p.lines.forEach((l) => lines.add(l))
        break
      }
      // Direction + number in the same segment catches plural forms like "platforms 3 and 4"
      if (numMatch && dirMatch) {
        const numRe = new RegExp(`\\b${numMatch[1]}\\b`)
        if (seg.includes(dirMatch[1].toLowerCase()) && numRe.test(seg)) {
          p.lines.forEach((l) => lines.add(l))
          break
        }
      }
    }
  }
  return [...lines].sort()
}

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
  // Station platforms used to derive which tube lines each lift serves.
  platforms?: PlatformDetail[]
}

export const EquipmentPicker = ({
  label,
  loading,
  equipment,
  selectedId,
  onSelect,
  emptyText,
  highlightedIds,
  platforms,
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
              // Extract "Lift A" / "Escalator 2" from before the colon for use as the primary label.
              const equipName = e.connection.includes(':')
                ? e.connection.split(':')[0].trim()
                : null
              const body = connectionBody(e.connection, e.equipment_type.name)
              const ends = body
                .split(/↔|→/)
                .map((s) => s.trim())
                .filter(Boolean)
              const arrow = isLift ? '↔' : '→'
              // Single string "from ↔ to" so the arrow always sits between its endpoints,
              // regardless of where the text wraps.
              const route = ends.length > 1 ? `${ends[0]} ${arrow} ${ends[1]}` : (ends[0] ?? '')
              const lines = platforms ? linesForEquipment(e.connection, platforms) : []
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
                    <Text fontSize={15} fontWeight="600" color={Colors.text}>
                      {equipName ?? route}
                    </Text>
                    {equipName && (
                      <Text fontSize={13} color={Colors.secondaryText}>
                        {route}
                      </Text>
                    )}
                    {lines.length > 0 && <LineChips lines={lines} />}
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
