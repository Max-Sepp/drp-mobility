import type { Station } from '@/navigation/types'

let _callback: ((station: Station) => void) | null = null

export const stationPicker = {
  register: (cb: (station: Station) => void) => {
    _callback = cb
  },
  resolve: (station: Station) => {
    _callback?.(station)
    _callback = null
  },
}
