// Display formatting for an equipment connection string ("Lift D: Ticket Hall → Eastbound Platform
// 1"). The stored string always uses a one-way arrow "→" (and the endpoint parser in
// features/journey/api/accessibility.ts relies on that), but a lift is bidirectional, so for lifts
// we show a two-way arrow "↔" at render time. Escalators genuinely run one way, so they keep "→".

/** The connection string as it should be shown to the user, given the equipment type. */
export function formatConnection(connection: string, equipmentType: string): string {
  return equipmentType === 'lift' ? connection.replace(/→/g, '↔') : connection
}

/**
 * The connection with the leading equipment name dropped — both endpoints shown equally, e.g.
 * "Ticket Hall ↔ Eastbound Platform 1, Westbound Platform 2". The name ("Lift D") adds nothing
 * in a picker where the type is already known, so it's stripped.
 */
export function connectionBody(connection: string, equipmentType: string): string {
  const formatted = formatConnection(connection, equipmentType)
  const colon = formatted.indexOf(':')
  return colon >= 0 ? formatted.slice(colon + 1).trim() : formatted
}

export type Direction = 'northbound' | 'southbound' | 'eastbound' | 'westbound'

const ALL_DIRECTIONS_RE = /(north|south|east|west)bound/gi

/** The distinct travel directions present across a set of connection strings, in compass order. */
export function connectionDirections(connections: string[]): Direction[] {
  const present = new Set<string>()
  for (const c of connections) {
    for (const d of c.match(ALL_DIRECTIONS_RE) ?? []) present.add(d.toLowerCase())
  }
  const order: Direction[] = ['northbound', 'eastbound', 'southbound', 'westbound']
  return order.filter((d) => present.has(d))
}
