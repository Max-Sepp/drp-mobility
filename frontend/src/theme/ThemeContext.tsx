import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { THEMES, DEFAULT_THEME_ID, type Theme, type ThemeId } from './themes'

const STORAGE_KEY = 'drp_theme_id'

type ThemeContextValue = {
  theme: Theme
  themeId: ThemeId
  setTheme: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>(DEFAULT_THEME_ID)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in THEMES) setThemeId(stored as ThemeId)
    })
  }, [])

  function setTheme(id: ThemeId) {
    setThemeId(id)
    AsyncStorage.setItem(STORAGE_KEY, id)
  }

  return (
    <ThemeContext.Provider value={{ theme: THEMES[themeId], themeId, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx.theme
}

export function useThemeControls(): { themeId: ThemeId; setTheme: (id: ThemeId) => void } {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useThemeControls must be used within a ThemeProvider')
  return { themeId: ctx.themeId, setTheme: ctx.setTheme }
}
