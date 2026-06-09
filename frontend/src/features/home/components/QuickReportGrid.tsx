import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import { useTheme, Borders, Typography } from '@/theme'

export type QuickReportAction =
  | { route: 'ReportForm'; equipmentType: 'lift' | 'escalator' }
  | { route: 'ReportCustom' }

type GridItem = {
  label: string
  icon: keyof typeof MaterialIcons.glyphMap
  action: QuickReportAction
  requires?: 'lift' | 'escalator'
}

const GRID_ITEMS: GridItem[] = [
  {
    label: 'Lift\nBroken',
    icon: 'elevator',
    action: { route: 'ReportForm', equipmentType: 'lift' },
    requires: 'lift',
  },
  {
    label: 'Escalator\nBroken',
    icon: 'escalator',
    action: { route: 'ReportForm', equipmentType: 'escalator' },
    requires: 'escalator',
  },
  { label: 'Overcrowding', icon: 'groups', action: { route: 'ReportCustom' } },
  { label: 'Custom\nIssue', icon: 'edit-note', action: { route: 'ReportCustom' } },
]

type QuickReportGridProps = {
  onSelect: (action: QuickReportAction) => void
  hasLifts?: boolean
  hasEscalators?: boolean
}

export const QuickReportGrid = ({ onSelect, hasLifts, hasEscalators }: QuickReportGridProps) => {
  const { Colors, Radii } = useTheme()

  const visibleItems = GRID_ITEMS.filter((item) => {
    if (item.requires === 'lift') return hasLifts !== false
    if (item.requires === 'escalator') return hasEscalators !== false
    return true
  })

  return (
    <>
      <Heading
        fontSize={Typography.label.fontSize}
        fontWeight="600"
        color={Colors.secondaryText}
        mt="$4"
        mb="$2"
        mx="$4"
      >
        Quick report
      </Heading>
      <XStack flexWrap="wrap" mx="$4" gap="$2.5" justify="center">
        {visibleItems.map((item) => (
          <YStack
            key={item.label}
            width="47%"
            pressStyle={{ opacity: 0.65 }}
            onPress={() => onSelect(item.action)}
            style={{
              aspectRatio: 1.3,
              borderWidth: Borders.medium,
              borderColor: Colors.border,
              borderRadius: Radii.button,
              backgroundColor: Colors.card,
            }}
          >
            <YStack flex={1} items="center" justify="center" gap="$1.5">
              <MaterialIcons name={item.icon} size={40} color={Colors.text} />
              <Text
                fontSize={Typography.body.fontSize}
                fontWeight="600"
                color={Colors.text}
                lineHeight={20}
                style={{ textAlign: 'center' }}
              >
                {item.label}
              </Text>
            </YStack>
          </YStack>
        ))}
      </XStack>
    </>
  )
}
