import { Text, XStack } from 'tamagui'
import { lineColour } from '../lineColours'

type LineChipsProps = {
  lines: string[]
}

/** Renders each line name as a chip in its official TfL colour. The name is always shown, so
 * colour augments rather than replaces the label. */
export const LineChips = ({ lines }: LineChipsProps) => {
  if (lines.length === 0) return null
  return (
    <XStack flexWrap="wrap" gap="$1.5">
      {lines.map(name => {
        const { background, foreground } = lineColour(name)
        return (
          <XStack key={name} px="$2" py="$1" style={{ backgroundColor: background, borderRadius: 4 }}>
            <Text fontSize={12} fontWeight="600" style={{ color: foreground }}>{name}</Text>
          </XStack>
        )
      })}
    </XStack>
  )
}
