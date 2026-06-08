// Central design tokens for the app.
// All components should import from here — never hardcode colours, radii, or spacing.

import { StyleSheet } from 'react-native'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const Colors = {
  // Page / background
  background: '#FAFAF5', // warm off-white
  card: '#FFFFFF',
  searchBg: '#F0F0EE',

  // Map placeholder
  mapBg: '#D4E5C0',
  mapGrid: '#BFCFAA',
  mapWater: '#A8CCDE',

  // Text
  text: '#0A0A0A',
  secondaryText: '#555555',
  tertiaryText: '#999999',
  placeholderText: '#AAAAAA',

  // Separator / border
  separator: '#CCCCCC', // hairline dividers between list items
  border: '#0A0A0A', // hard black borders on cards and buttons

  // Brand / interactive
  blue: '#1A56FF', // electric blue
  blueDark: '#0033CC',

  // Semantic — base colours
  success: '#00B050',
  warning: '#FF8000',
  danger: '#E8002D',

  // Semantic — tinted backgrounds and dark variants
  successBg: '#CCFCE0',
  successDark: '#006630',
  warningBg: '#FFF0CC',
  warningDark: '#7A3A00',
  warningBorder: '#FF8000',
  dangerBg: '#FFD6DC',
  dangerDark: '#990018',
  dangerBorder: '#E8002D',
  blueBg: '#DCE5FF',
} as const

// ---------------------------------------------------------------------------
// Border radii — reduced for a boxy neo-brutalist feel
// ---------------------------------------------------------------------------

export const Radii = {
  card: 6,
  button: 6,
  input: 6,
  pill: 6, // search bar becomes a rounded rectangle
  small: 4,
  xs: 2,
  handle: 2,
  icon: 6,
} as const

// ---------------------------------------------------------------------------
// Shadows — hard offset (defining neo-brutalist characteristic)
// ---------------------------------------------------------------------------

export const Shadows = {
  card: {
    boxShadow: '3px 3px 0px #0A0A0A',
    elevation: 4,
  },
  heavy: {
    boxShadow: '5px 5px 0px #0A0A0A',
    elevation: 8,
  },
  top: {
    boxShadow: '0px -3px 0px #0A0A0A',
    elevation: 4,
  },
  marker: {
    boxShadow: '2px 2px 0px #0A0A0A',
    elevation: 4,
  },
} as const

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const Typography = {
  largeTitle: { fontSize: 28, fontWeight: '800' as const, color: Colors.text },
  heading: { fontSize: 22, fontWeight: '800' as const, color: Colors.text },
  sectionTitle: { fontSize: 17, fontWeight: '700' as const, color: Colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: Colors.text },
  bodyBold: { fontSize: 15, fontWeight: '700' as const, color: Colors.text },
  caption: { fontSize: 13, fontWeight: '400' as const, color: Colors.secondaryText },
  captionBold: { fontSize: 13, fontWeight: '700' as const, color: Colors.secondaryText },
  label: { fontSize: 11, fontWeight: '700' as const, color: Colors.secondaryText },
} as const

// ---------------------------------------------------------------------------
// Spacing
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
// Borders — thicker for bold neo-brutalist outlines
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
// Reusable StyleSheet fragments
// ---------------------------------------------------------------------------

export const SharedStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.card,
    borderWidth: Borders.medium,
    borderColor: Colors.border,
    ...Shadows.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  screenBackground: {
    flex: 1,
    backgroundColor: Colors.background,
  },
})
