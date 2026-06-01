export function parseUtc(iso: string): Date {
  // Append Z if no timezone designator so it's always parsed as UTC
  const hasTimezoneDesignator = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(iso)
  const normalized = hasTimezoneDesignator ? iso : iso + 'Z'
  return new Date(normalized)
}

export function formatTime(iso: string): string {
  const d = parseUtc(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function isToday(iso: string): boolean {
  const d = parseUtc(iso)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}
