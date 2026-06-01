import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'

export type QuickReportAction =
  | { route: 'ReportForm'; equipmentType: 'lift' | 'escalator' }
  | { route: 'ReportCustom' }

type GridItem = {
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  action?: QuickReportAction
}

const GRID_ITEMS: GridItem[] = [
  { label: 'Lift\nBroken', icon: 'elevator', action: { route: 'ReportForm', equipmentType: 'lift' } },
  { label: 'Escalator\nBroken', icon: 'escalator', action: { route: 'ReportForm', equipmentType: 'escalator' } },
  { label: 'Overcrowding', icon: 'groups' },
  { label: 'Custom\nIssue', icon: 'edit-note', action: { route: 'ReportCustom' } },
]

type QuickReportGridProps = {
  onSelect: (action: QuickReportAction) => void
}

/** The two-column grid of quick-report tiles; tiles without an action are shown disabled. */
export const QuickReportGrid = ({ onSelect }: QuickReportGridProps) => {
  return (
    <>
      <Heading fontSize={13} fontWeight="600" color="#374151" mt="$4" mb="$2" mx="$4">Quick report</Heading>
      <XStack flexWrap="wrap" mx="$4" gap="$2.5" justify="center">
        {GRID_ITEMS.map(item => {
          const disabled = !item.action
          return (
            <YStack
              key={item.label}
              width="47%"
              opacity={disabled ? 0.4 : 1}
              pressStyle={disabled ? undefined : { opacity: 0.7 }}
              onPress={disabled ? undefined : () => onSelect(item.action!)}
              style={{ aspectRatio: 1.3, borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: 'white' }}
            >
              <YStack flex={1} items="center" justify="center" gap="$1.5">
                <MaterialIcons name={item.icon} size={40} color={disabled ? '#9ca3af' : '#111827'} />
                <Text
                  fontSize={15}
                  fontWeight="600"
                  color="#111827"
                  lineHeight={20}
                  style={{ textAlign: 'center' }}
                >
                  {item.label}
                </Text>
              </YStack>
            </YStack>
          )
        })}
      </XStack>
    </>
  )
}
