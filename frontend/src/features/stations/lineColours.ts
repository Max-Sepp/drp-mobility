// Official TfL line colours, paired with a legible foreground for the line name. Light line
// colours (Circle, Hammersmith & City, Jubilee, Waterloo & City) take dark text; the rest white.
type LineColour = { background: string; foreground: string }

const DARK = '#111827'
const LIGHT = '#ffffff'

const LINE_COLOURS: Record<string, LineColour> = {
  Bakerloo: { background: '#B36305', foreground: LIGHT },
  Central: { background: '#E32017', foreground: LIGHT },
  Circle: { background: '#FFD300', foreground: DARK },
  District: { background: '#00782A', foreground: LIGHT },
  'Hammersmith & City': { background: '#F3A9BB', foreground: DARK },
  Jubilee: { background: '#A0A5A9', foreground: DARK },
  Metropolitan: { background: '#9B0056', foreground: LIGHT },
  Northern: { background: '#000000', foreground: LIGHT },
  Piccadilly: { background: '#003688', foreground: LIGHT },
  Victoria: { background: '#0098D4', foreground: LIGHT },
  'Waterloo & City': { background: '#95CDBA', foreground: DARK },
  DLR: { background: '#00A4A7', foreground: LIGHT },
  'London Overground': { background: '#EE7C0E', foreground: LIGHT },
  Elizabeth: { background: '#6950A1', foreground: LIGHT },
  'National Rail': { background: '#C00000', foreground: LIGHT },
}

// Neutral chip for any line not in the map, so an unknown line still renders legibly.
const FALLBACK: LineColour = { background: '#e5e7eb', foreground: '#374151' }

export function lineColour(name: string): LineColour {
  return LINE_COLOURS[name] ?? FALLBACK
}
