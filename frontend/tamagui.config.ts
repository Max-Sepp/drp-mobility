import { createAnimations } from '@tamagui/animations-react-native'
import { defaultConfig } from '@tamagui/config/v4'
import { createTamagui } from 'tamagui'

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  animations: createAnimations({
    fast: { type: 'spring', damping: 20, mass: 1.2, stiffness: 250 },
    medium: { type: 'spring', damping: 10, mass: 0.9, stiffness: 100 },
    slow: { type: 'spring', damping: 20, stiffness: 60 },
  }),
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig
declare module 'tamagui' {
  // Required Tamagui idiom: the empty interface merges our config's type into
  // Tamagui's so themes/tokens are typed app-wide.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends Conf {}
}
