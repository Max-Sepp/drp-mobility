import { MaterialIcons } from '@expo/vector-icons'
import type { ReactNode } from 'react'
import { TouchableOpacity, View } from 'react-native'
import { Text } from 'tamagui'
import { useTheme, Spacing } from '@/theme'

type SheetHeaderProps = {
  title: string
  subtitle?: string
  onClose: () => void
  /** Rendered to the left of the title — e.g. a back arrow for multi-step flows. */
  left?: ReactNode
  /** Rendered between the title and the close button — e.g. a saved-journeys badge. */
  right?: ReactNode
  /** Adds extra top padding when the sheet has no gorhom handle bar (modal style). */
  modal?: boolean
  /** Override the title font size. Defaults to 18. */
  titleFontSize?: number
}

/**
 * Consistent header row for all bottom sheets: optional left action, title (+ optional
 * subtitle), optional right extras, and always a close button on the far right.
 */
export function SheetHeader({ title, subtitle, onClose, left, right, modal, titleFontSize = 18 }: SheetHeaderProps) {
  const { Colors } = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.lg,
        paddingTop: modal ? Spacing.lg : 0,
        paddingBottom: Spacing.md,
      }}
    >
      {left}

      <View style={{ flex: 1 }}>
        <Text fontSize={titleFontSize} fontWeight="700" color={Colors.text} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text fontSize={13} color={Colors.secondaryText} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {right}

      <TouchableOpacity
        onPress={onClose}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MaterialIcons name="close" size={18} color={Colors.secondaryText} />
      </TouchableOpacity>
    </View>
  )
}
