// Central design tokens for the app.
// All new components should import from here rather than hardcoding values.
// Neo-brutalist screens (report forms, journey planner) may still use their
// own inline styles for now; migrate them gradually.

import { StyleSheet } from 'react-native'

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

export const Colors = {
  // Page / background
  background: '#F2F2F7', // iOS systemGroupedBackground
  card: '#FFFFFF',
  searchBg: '#EFEFF4',

  // Map placeholder
  mapBg: '#DDE8CC', // OSM-style light green
  mapGrid: '#C8D9B5',
  mapWater: '#B3D1E0',

  // Text
  text: '#000000',
  secondaryText: '#8E8E93', // iOS secondaryLabel
  tertiaryText: '#C7C7CC',
  placeholderText: '#AEAEB2',

  // Separator / border
  separator: '#C6C6C8',
  border: '#E5E5EA',

  // Brand / interactive
  blue: '#007AFF', // iOS blue
  blueDark: '#0062CC',

  // Semantic
  success: '#34C759',
  warning: '#FF9500',
  danger: '#FF3B30',
} as const

// ---------------------------------------------------------------------------
// Border radii
// ---------------------------------------------------------------------------

export const Radii = {
  card: 16,
  button: 12,
  input: 12,
  pill: 999,
  small: 8,
  xs: 4,
} as const

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

export const Shadows = {
  // boxShadow works on iOS, Android (RN 0.76+), and web — replaces deprecated shadow* props.
  card: {
    boxShadow: '0px 2px 8px rgba(0,0,0,0.08)',
    elevation: 3,
  },
  heavy: {
    boxShadow: '0px 4px 16px rgba(0,0,0,0.14)',
    elevation: 6,
  },
  top: {
    boxShadow: '0px -2px 8px rgba(0,0,0,0.06)',
    elevation: 3,
  },
} as const

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

export const Typography = {
  largeTitle: { fontSize: 28, fontWeight: '700' as const, color: Colors.text },
  heading: { fontSize: 22, fontWeight: '700' as const, color: Colors.text },
  sectionTitle: { fontSize: 17, fontWeight: '600' as const, color: Colors.text },
  body: { fontSize: 15, fontWeight: '400' as const, color: Colors.text },
  bodyBold: { fontSize: 15, fontWeight: '600' as const, color: Colors.text },
  caption: { fontSize: 13, fontWeight: '400' as const, color: Colors.secondaryText },
  captionBold: { fontSize: 13, fontWeight: '600' as const, color: Colors.secondaryText },
  label: { fontSize: 11, fontWeight: '600' as const, color: Colors.secondaryText },
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
// Reusable StyleSheet fragments
// ---------------------------------------------------------------------------

export const SharedStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.card,
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
