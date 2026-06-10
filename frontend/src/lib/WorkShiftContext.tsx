import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'drp_work_shift'

// The shift station is a per-day declaration: staff say where they are working "for the day",
// and it auto-clears once the date rolls over so they re-confirm each shift.
type StoredShift = { station: string; date: string }

type WorkShiftContextValue = {
  workStation: string | null
  setWorkStation: (station: string | null) => void
}

const WorkShiftContext = createContext<WorkShiftContextValue | null>(null)

// Local YYYY-MM-DD day string. Using the device's local day (not UTC) so the shift expires at
// the rider's midnight, matching their sense of "today".
function today(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function WorkShiftProvider({ children }: { children: ReactNode }) {
  const [workStation, setWorkStationState] = useState<string | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!stored) return
      try {
        const parsed = JSON.parse(stored) as StoredShift
        if (parsed.station && parsed.date === today()) {
          setWorkStationState(parsed.station)
        } else {
          // Stale (a previous day) — drop it so today starts fresh.
          AsyncStorage.removeItem(STORAGE_KEY)
        }
      } catch {
        AsyncStorage.removeItem(STORAGE_KEY)
      }
    })
  }, [])

  function setWorkStation(station: string | null) {
    setWorkStationState(station)
    if (station === null) {
      AsyncStorage.removeItem(STORAGE_KEY)
    } else {
      const value: StoredShift = { station, date: today() }
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    }
  }

  return (
    <WorkShiftContext.Provider value={{ workStation, setWorkStation }}>
      {children}
    </WorkShiftContext.Provider>
  )
}

export function useWorkShift(): WorkShiftContextValue {
  const ctx = useContext(WorkShiftContext)
  if (!ctx) throw new Error('useWorkShift must be used within a WorkShiftProvider')
  return ctx
}
