import { MaterialIcons } from '@expo/vector-icons'
import { Text, XStack, YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import { Borders, Colors, Opacity, Radii, Typography } from '@/theme'

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

export const QuickReportGrid = ({ onSelect }: QuickReportGridProps) => {
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
        {GRID_ITEMS.map((item) => {
          const disabled = !item.action
          return (
            <YStack
              key={item.label}
              width="47%"
              opacity={disabled ? Opacity.disabled : 1}
              pressStyle={disabled ? undefined : { opacity: Opacity.pressed }}
              onPress={disabled ? undefined : () => onSelect(item.action!)}
              style={{
                aspectRatio: 1.3,
                borderWidth: Borders.medium,
                borderColor: Colors.border,
                borderRadius: Radii.button,
                backgroundColor: Colors.card,
              }}
            >
              <YStack flex={1} items="center" justify="center" gap="$1.5">
                <MaterialIcons
                  name={item.icon}
                  size={40}
                  color={disabled ? Colors.tertiaryText : Colors.text}
                />
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
          )
        })}
      </XStack>
    </>
  )
}
