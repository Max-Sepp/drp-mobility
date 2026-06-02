import type { Station } from '@/navigation/types'

// The station list is now loaded live from the backend (GET /stations, see useStations).
// Only the initial selection shown on first launch lives here.
export const DEFAULT_STATION: Station = 'Victoria'
