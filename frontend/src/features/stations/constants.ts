import type { Station } from '@/navigation/types'

export const STATIONS: { name: Station; lines: string[] }[] = [
  { name: "King's Cross", lines: ['Circle', 'Hammersmith & City', 'Metropolitan', 'Northern', 'Piccadilly', 'Victoria'] },
  { name: 'London Bridge', lines: ['Jubilee', 'Northern'] },
  { name: 'Paddington', lines: ['Bakerloo', 'Circle', 'District', 'Hammersmith & City'] },
  { name: 'Victoria', lines: ['Circle', 'District', 'Victoria'] },
  { name: 'Waterloo', lines: ['Bakerloo', 'Jubilee', 'Northern', 'Waterloo & City'] },
]

export const DEFAULT_STATION: Station = 'Victoria'
