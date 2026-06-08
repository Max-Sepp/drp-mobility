// Central design tokens.
// Theme-dependent tokens (Colors, Radii, Shadows) come from useTheme().
// Everything here is static — layout values that never change between themes.

import { StyleSheet } from 'react-native'

// Re-export the hook and types so components import from one place.
export { useTheme, useThemeControls, ThemeProvider } from './theme/ThemeContext'
export { THEMES, DEFAULT_THEME_ID } from './theme/themes'
export type { Theme, ThemeId, ThemeColors, ThemeRadii, ThemeShadows } from './theme/themes'

// ---------------------------------------------------------------------------
// Typography — font size and weight only; colour is always set by the component
// using its theme's Colors.text / Colors.secondaryText.
// ---------------------------------------------------------------------------

export const Typography = {
  largeTitle: { fontSize: 28, fontWeight: '800' as const },
  heading:    { fontSize: 22, fontWeight: '800' as const },
  sectionTitle:{ fontSize: 17, fontWeight: '700' as const },
  body:       { fontSize: 15, fontWeight: '400' as const },
  bodyBold:   { fontSize: 15, fontWeight: '700' as const },
  caption:    { fontSize: 13, fontWeight: '400' as const },
  captionBold:{ fontSize: 13, fontWeight: '700' as const },
  label:      { fontSize: 11, fontWeight: '700' as const },
} as const

// ---------------------------------------------------------------------------
// Spacing — 4 pt grid
// ---------------------------------------------------------------------------

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
} as const

// ---------------------------------------------------------------------------
// Borders — line widths
// ---------------------------------------------------------------------------

export const Borders = {
  thin: 1.5,
  medium: 2,
  thick: 3,
} as const

// ---------------------------------------------------------------------------
// Opacity
// ---------------------------------------------------------------------------

export const Opacity = {
  disabled: 0.35,
  disabledMid: 0.55,
  subtle: 0.5,
  pressed: 0.65,
  pressedLight: 0.75,
} as const

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

export const Overlays = {
  backdrop: 'rgba(0,0,0,0.45)',
} as const

// ---------------------------------------------------------------------------
// Heights
// ---------------------------------------------------------------------------

export const Heights = {
  button: 52,
  touchTarget: 48,
} as const

// ---------------------------------------------------------------------------
// Hairline — useful static constant from StyleSheet
// ---------------------------------------------------------------------------

export const hairlineWidth = StyleSheet.hairlineWidth
