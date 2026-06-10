// All theme definitions. Each theme provides Colors, Radii, and Shadows.
// Static tokens (Spacing, Borders, Opacity, Heights) live in theme.ts and never change.

// HexColor is a template literal — more specific than `string`, satisfying Tamagui's
// color prop which requires a string literal or token, not the broad `string` type.
export type HexColor = `#${string}`

export type ThemeColors = {
  background: HexColor
  card: HexColor
  searchBg: HexColor
  mapBg: HexColor
  mapGrid: HexColor
  mapWater: HexColor
  text: HexColor
  secondaryText: HexColor
  tertiaryText: HexColor
  placeholderText: HexColor
  separator: HexColor
  border: HexColor
  blue: HexColor
  blueDark: HexColor
  success: HexColor
  warning: HexColor
  danger: HexColor
  successBg: HexColor
  successDark: HexColor
  warningBg: HexColor
  warningDark: HexColor
  warningBorder: HexColor
  dangerBg: HexColor
  dangerDark: HexColor
  dangerBorder: HexColor
  blueBg: HexColor
}

export type ThemeRadii = {
  card: number
  button: number
  input: number
  pill: number
  small: number
  xs: number
  handle: number
  icon: number
  circle: number
}

export type ThemeShadows = {
  card: object
  heavy: object
  top: object
  marker: object
}

export type Theme = {
  id: ThemeId
  label: string
  Colors: ThemeColors
  Radii: ThemeRadii
  Shadows: ThemeShadows
}

export type ThemeId =
  | 'lightBrutalist'
  | 'darkBrutalist'
  | 'light'
  | 'dark'
  | 'highContrast'
  | 'deuteranopia'
  | 'protanopia'

// ---------------------------------------------------------------------------
// 1. Light Brutalist (default — current look)
// ---------------------------------------------------------------------------
const lightBrutalist: Theme = {
  id: 'lightBrutalist',
  label: 'Light Brutalist',
  Colors: {
    background: '#FAFAF5',
    card: '#FFFFFF',
    searchBg: '#F0F0EE',
    mapBg: '#D4E5C0',
    mapGrid: '#BFCFAA',
    mapWater: '#A8CCDE',
    text: '#0A0A0A',
    secondaryText: '#555555',
    tertiaryText: '#999999',
    placeholderText: '#AAAAAA',
    separator: '#CCCCCC',
    border: '#0A0A0A',
    blue: '#1A56FF',
    blueDark: '#0033CC',
    success: '#00B050',
    warning: '#FF8000',
    danger: '#E8002D',
    successBg: '#CCFCE0',
    successDark: '#006630',
    warningBg: '#FFF0CC',
    warningDark: '#7A3A00',
    warningBorder: '#FF8000',
    dangerBg: '#FFD6DC',
    dangerDark: '#990018',
    dangerBorder: '#E8002D',
    blueBg: '#DCE5FF',
  },
  Radii: {
    card: 6,
    button: 6,
    input: 6,
    pill: 6,
    small: 4,
    xs: 2,
    handle: 2,
    icon: 6,
    circle: 9999,
  },
  Shadows: {
    card: { boxShadow: '3px 3px 0px #0A0A0A', elevation: 4 },
    heavy: { boxShadow: '5px 5px 0px #0A0A0A', elevation: 8 },
    top: { boxShadow: '0px -3px 0px #0A0A0A', elevation: 4 },
    marker: { boxShadow: '2px 2px 0px #0A0A0A', elevation: 4 },
  },
}

// ---------------------------------------------------------------------------
// 2. Dark Brutalist
// ---------------------------------------------------------------------------
const darkBrutalist: Theme = {
  id: 'darkBrutalist',
  label: 'Dark Brutalist',
  Colors: {
    background: '#0A0A0A',
    card: '#1A1A1A',
    searchBg: '#2A2A2A',
    mapBg: '#1A2A14',
    mapGrid: '#243318',
    mapWater: '#142030',
    text: '#F0F0EA',
    secondaryText: '#AAAAAA',
    tertiaryText: '#666666',
    placeholderText: '#555555',
    separator: '#333333',
    border: '#F0F0EA',
    blue: '#5580FF',
    blueDark: '#3355DD',
    success: '#00CC60',
    warning: '#FF9900',
    danger: '#FF3355',
    successBg: '#00331A',
    successDark: '#00FF80',
    warningBg: '#332200',
    warningDark: '#FFBB44',
    warningBorder: '#FF9900',
    dangerBg: '#330011',
    dangerDark: '#FF8899',
    dangerBorder: '#FF3355',
    blueBg: '#0A1A44',
  },
  Radii: {
    card: 6,
    button: 6,
    input: 6,
    pill: 6,
    small: 4,
    xs: 2,
    handle: 2,
    icon: 6,
    circle: 9999,
  },
  Shadows: {
    card: { boxShadow: '3px 3px 0px #F0F0EA', elevation: 4 },
    heavy: { boxShadow: '5px 5px 0px #F0F0EA', elevation: 8 },
    top: { boxShadow: '0px -3px 0px #F0F0EA', elevation: 4 },
    marker: { boxShadow: '2px 2px 0px #F0F0EA', elevation: 4 },
  },
}

// ---------------------------------------------------------------------------
// 3. Light (clean, modern)
// ---------------------------------------------------------------------------
const light: Theme = {
  id: 'light',
  label: 'Light',
  Colors: {
    background: '#F2F2F7',
    card: '#FFFFFF',
    searchBg: '#E5E5EA',
    mapBg: '#D4E5C0',
    mapGrid: '#BFCFAA',
    mapWater: '#A8CCDE',
    text: '#1C1C1E',
    secondaryText: '#6C6C70',
    tertiaryText: '#AEAEB2',
    placeholderText: '#C7C7CC',
    separator: '#E5E5EA',
    border: '#E5E5EA',
    blue: '#007AFF',
    blueDark: '#0055CC',
    success: '#34C759',
    warning: '#FF9500',
    danger: '#FF3B30',
    successBg: '#D4F5DD',
    successDark: '#1A7A30',
    warningBg: '#FFF3D4',
    warningDark: '#7A4400',
    warningBorder: '#FF9500',
    dangerBg: '#FFD5D3',
    dangerDark: '#8A1C18',
    dangerBorder: '#FF3B30',
    blueBg: '#D6EBFF',
  },
  Radii: {
    card: 12,
    button: 10,
    input: 10,
    pill: 20,
    small: 6,
    xs: 4,
    handle: 3,
    icon: 10,
    circle: 9999,
  },
  Shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
      elevation: 2,
    },
    heavy: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 6,
    },
    top: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 4,
    },
    marker: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
  },
}

// ---------------------------------------------------------------------------
// 4. Dark (clean, modern)
// ---------------------------------------------------------------------------
const dark: Theme = {
  id: 'dark',
  label: 'Dark',
  Colors: {
    background: '#1C1C1E',
    card: '#2C2C2E',
    searchBg: '#3A3A3C',
    mapBg: '#1A2A14',
    mapGrid: '#243318',
    mapWater: '#142030',
    text: '#FFFFFF',
    secondaryText: '#EBEBF5CC', // translucent white
    tertiaryText: '#EBEBF560',
    placeholderText: '#EBEBF540',
    separator: '#3A3A3C',
    border: '#48484A',
    blue: '#0A84FF',
    blueDark: '#0055CC',
    success: '#30D158',
    warning: '#FF9F0A',
    danger: '#FF453A',
    successBg: '#0A2A18',
    successDark: '#30D158',
    warningBg: '#2A1800',
    warningDark: '#FF9F0A',
    warningBorder: '#FF9F0A',
    dangerBg: '#2A0A08',
    dangerDark: '#FF453A',
    dangerBorder: '#FF453A',
    blueBg: '#001A3A',
  },
  Radii: {
    card: 12,
    button: 10,
    input: 10,
    pill: 20,
    small: 6,
    xs: 4,
    handle: 3,
    icon: 10,
    circle: 9999,
  },
  Shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 8,
      elevation: 4,
    },
    heavy: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.5,
      shadowRadius: 16,
      elevation: 8,
    },
    top: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    marker: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.4,
      shadowRadius: 4,
      elevation: 4,
    },
  },
}

// ---------------------------------------------------------------------------
// 5. High Contrast
// ---------------------------------------------------------------------------
const highContrast: Theme = {
  id: 'highContrast',
  label: 'High Contrast',
  Colors: {
    background: '#000000',
    card: '#000000',
    searchBg: '#1A1A1A',
    mapBg: '#000000',
    mapGrid: '#111111',
    mapWater: '#000000',
    text: '#FFFFFF',
    secondaryText: '#FFFFFF',
    tertiaryText: '#DDDDDD',
    placeholderText: '#BBBBBB',
    separator: '#FFFFFF',
    border: '#FFFFFF',
    blue: '#FFFF00', // yellow — maximum visibility on black
    blueDark: '#DDDD00',
    success: '#00FF88',
    warning: '#FFAA00',
    danger: '#FF4444',
    successBg: '#003322',
    successDark: '#00FF88',
    warningBg: '#332200',
    warningDark: '#FFAA00',
    warningBorder: '#FFAA00',
    dangerBg: '#330000',
    dangerDark: '#FF8888',
    dangerBorder: '#FF4444',
    blueBg: '#111100',
  },
  Radii: {
    card: 4,
    button: 4,
    input: 4,
    pill: 4,
    small: 2,
    xs: 1,
    handle: 1,
    icon: 4,
    circle: 9999,
  },
  Shadows: {
    card: { boxShadow: '3px 3px 0px #FFFFFF', elevation: 4 },
    heavy: { boxShadow: '5px 5px 0px #FFFFFF', elevation: 8 },
    top: { boxShadow: '0px -3px 0px #FFFFFF', elevation: 4 },
    marker: { boxShadow: '2px 2px 0px #FFFFFF', elevation: 4 },
  },
}

// ---------------------------------------------------------------------------
// 6. Deuteranopia-friendly (Okabe-Ito palette — safe for red/green colourblindness)
// ---------------------------------------------------------------------------
const deuteranopia: Theme = {
  id: 'deuteranopia',
  label: 'Deuteranopia',
  Colors: {
    background: '#FAFAF5',
    card: '#FFFFFF',
    searchBg: '#F0F0EE',
    mapBg: '#D4E5C0',
    mapGrid: '#BFCFAA',
    mapWater: '#A8CCDE',
    text: '#0A0A0A',
    secondaryText: '#555555',
    tertiaryText: '#999999',
    placeholderText: '#AAAAAA',
    separator: '#CCCCCC',
    border: '#0A0A0A',
    blue: '#0072B2', // Okabe-Ito blue
    blueDark: '#004E7A',
    success: '#009E73', // Okabe-Ito bluish green (distinguishable from orange)
    warning: '#E69F00', // Okabe-Ito orange
    danger: '#D55E00', // Okabe-Ito vermillion
    successBg: '#CCF0E8',
    successDark: '#005940',
    warningBg: '#FFF0CC',
    warningDark: '#7A4A00',
    warningBorder: '#E69F00',
    dangerBg: '#F5DDD0',
    dangerDark: '#7A3400',
    dangerBorder: '#D55E00',
    blueBg: '#CCE4F5',
  },
  Radii: {
    card: 6,
    button: 6,
    input: 6,
    pill: 6,
    small: 4,
    xs: 2,
    handle: 2,
    icon: 6,
    circle: 9999,
  },
  Shadows: {
    card: { boxShadow: '3px 3px 0px #0A0A0A', elevation: 4 },
    heavy: { boxShadow: '5px 5px 0px #0A0A0A', elevation: 8 },
    top: { boxShadow: '0px -3px 0px #0A0A0A', elevation: 4 },
    marker: { boxShadow: '2px 2px 0px #0A0A0A', elevation: 4 },
  },
}

// ---------------------------------------------------------------------------
// 7. Protanopia-friendly (adjusted Okabe-Ito — safe for red-blind users)
// ---------------------------------------------------------------------------
const protanopia: Theme = {
  id: 'protanopia',
  label: 'Protanopia',
  Colors: {
    background: '#FAFAF5',
    card: '#FFFFFF',
    searchBg: '#F0F0EE',
    mapBg: '#D4E5C0',
    mapGrid: '#BFCFAA',
    mapWater: '#A8CCDE',
    text: '#0A0A0A',
    secondaryText: '#555555',
    tertiaryText: '#999999',
    placeholderText: '#AAAAAA',
    separator: '#CCCCCC',
    border: '#0A0A0A',
    blue: '#56B4E9', // Okabe-Ito sky blue (very distinct for protanopes)
    blueDark: '#2288CC',
    success: '#009E73', // Okabe-Ito bluish green
    warning: '#F0E442', // Okabe-Ito yellow (high visibility)
    danger: '#D55E00', // Okabe-Ito vermillion (looks orange to protanopes — distinct from blue)
    successBg: '#CCF0E8',
    successDark: '#005940',
    warningBg: '#FAFACC',
    warningDark: '#6A6A00',
    warningBorder: '#F0E442',
    dangerBg: '#F5DDD0',
    dangerDark: '#7A3400',
    dangerBorder: '#D55E00',
    blueBg: '#D8EEFA',
  },
  Radii: {
    card: 6,
    button: 6,
    input: 6,
    pill: 6,
    small: 4,
    xs: 2,
    handle: 2,
    icon: 6,
    circle: 9999,
  },
  Shadows: {
    card: { boxShadow: '3px 3px 0px #0A0A0A', elevation: 4 },
    heavy: { boxShadow: '5px 5px 0px #0A0A0A', elevation: 8 },
    top: { boxShadow: '0px -3px 0px #0A0A0A', elevation: 4 },
    marker: { boxShadow: '2px 2px 0px #0A0A0A', elevation: 4 },
  },
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const THEMES: Record<ThemeId, Theme> = {
  lightBrutalist,
  darkBrutalist,
  light,
  dark,
  highContrast,
  deuteranopia,
  protanopia,
}

export const DEFAULT_THEME_ID: ThemeId = 'lightBrutalist'
