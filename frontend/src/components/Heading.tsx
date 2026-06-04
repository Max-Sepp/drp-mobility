import { Text, type TextProps } from 'tamagui'
import { Colors, Typography } from '@/theme'

/** Standard heading text. Defaults to the screen-title style; override props (fontSize/color/etc.) for smaller headings. */
export const Heading = (props: TextProps) => (
  <Text fontSize={Typography.heading.fontSize} fontWeight={Typography.heading.fontWeight} color={Colors.text} {...props} />
)
