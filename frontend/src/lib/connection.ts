// Display formatting for an equipment connection string ("Lift D: Ticket Hall → Eastbound Platform
// 1"). The stored string always uses a one-way arrow "→" (and the endpoint parser in
// features/journey/api/accessibility.ts relies on that), but a lift is bidirectional, so for lifts
// we show a two-way arrow "↔" at render time. Escalators genuinely run one way, so they keep "→".

/** The connection string as it should be shown to the user, given the equipment type. */
export function formatConnection(connection: string, equipmentType: string): string {
  return equipmentType === 'lift' ? connection.replace(/→/g, '↔') : connection
}
