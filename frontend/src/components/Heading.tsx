import { Text, type TextProps } from 'tamagui'
import { useTheme, Typography } from '@/theme'

/** Standard heading text. Defaults to the screen-title style; override props (fontSize/color/etc.) for smaller headings. */
export const Heading = (props: TextProps) => {
  const { Colors } = useTheme()
  return (
    <Text
      fontSize={Typography.heading.fontSize}
      fontWeight={Typography.heading.fontWeight}
      color={Colors.text}
      {...props}
    />
  )
}
