import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import type { AccessibilityPreference } from '@/features/journey/api/tfl'

const STORAGE_KEY = 'drp_accessibility_default'

type AccessibilityPreferenceContextValue = {
  defaultLevel: AccessibilityPreference | null
  setDefaultLevel: (level: AccessibilityPreference | null) => void
}

const AccessibilityPreferenceContext = createContext<AccessibilityPreferenceContextValue | null>(
  null,
)

export function AccessibilityPreferenceProvider({ children }: { children: ReactNode }) {
  const [defaultLevel, setDefaultLevelState] = useState<AccessibilityPreference | null>(null)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === 'StepFreeToVehicle' || stored === 'StepFreeToPlatform') {
        setDefaultLevelState(stored)
      }
    })
  }, [])

  function setDefaultLevel(level: AccessibilityPreference | null) {
    setDefaultLevelState(level)
    if (level === null) {
      AsyncStorage.removeItem(STORAGE_KEY)
    } else {
      AsyncStorage.setItem(STORAGE_KEY, level)
    }
  }

  return (
    <AccessibilityPreferenceContext.Provider value={{ defaultLevel, setDefaultLevel }}>
      {children}
    </AccessibilityPreferenceContext.Provider>
  )
}

export function useAccessibilityPreference(): AccessibilityPreferenceContextValue {
  const ctx = useContext(AccessibilityPreferenceContext)
  if (!ctx)
    throw new Error(
      'useAccessibilityPreference must be used within AccessibilityPreferenceProvider',
    )
  return ctx
}
