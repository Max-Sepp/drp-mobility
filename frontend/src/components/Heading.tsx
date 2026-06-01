import { Text, type TextProps } from 'tamagui'

/** Standard heading text. Defaults to the screen-title style; override props (fontSize/color/etc.) for smaller headings. */
export const Heading = (props: TextProps) => (
  <Text fontSize={22} fontWeight="700" color="#1a1a1a" {...props} />
)
