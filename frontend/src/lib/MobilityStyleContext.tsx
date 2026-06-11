import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import type { MaterialIcons } from '@expo/vector-icons'

const STORAGE_KEY = 'drp_mobility_style'

export type MobilityStyleId =
  | 'navigating'
  | 'rolling'
  | 'cruising'
  | 'gliding'
  | 'striding'
  | 'walking'

export type MobilityStyle = {
  id: MobilityStyleId
  name: string
  label: string
  description: string
  icon: keyof typeof MaterialIcons.glyphMap
}

export const MOBILITY_STYLES: Record<MobilityStyleId, MobilityStyle> = {
  navigating: {
    id: 'navigating',
    name: 'Navigating',
    label: 'Navigate',
    description: 'Neutral — no assumptions about how you move',
    icon: 'explore',
  },
  rolling: {
    id: 'rolling',
    name: 'Rolling',
    label: 'Roll',
    description: 'Wheelchair, scooter, or anything that rolls',
    icon: 'accessible-forward',
  },
  cruising: {
    id: 'cruising',
    name: 'Cruising',
    label: 'Cruise',
    description: 'Relaxed pace — stick, cane, or just taking it easy',
    icon: 'assist-walker',
  },
  gliding: {
    id: 'gliding',
    name: 'Gliding',
    label: 'Glide',
    description: 'Smooth and effortless',
    icon: 'air',
  },
  striding: {
    id: 'striding',
    name: 'Striding',
    label: 'Stride',
    description: 'Purposeful and on a mission',
    icon: 'nordic-walking',
  },
  walking: {
    id: 'walking',
    name: 'Walking',
    label: 'Walk',
    description: 'Classic — for everyone who walks',
    icon: 'directions-walk',
  },
}

export const DEFAULT_MOBILITY_STYLE_ID: MobilityStyleId = 'navigating'

type MobilityStyleContextValue = {
  styleId: MobilityStyleId
  style: MobilityStyle
  setStyle: (id: MobilityStyleId) => void
}

const MobilityStyleContext = createContext<MobilityStyleContextValue | null>(null)

export function MobilityStyleProvider({ children }: { children: ReactNode }) {
  const [styleId, setStyleId] = useState<MobilityStyleId>(DEFAULT_MOBILITY_STYLE_ID)

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored && stored in MOBILITY_STYLES) setStyleId(stored as MobilityStyleId)
    })
  }, [])

  function setStyle(id: MobilityStyleId) {
    setStyleId(id)
    AsyncStorage.setItem(STORAGE_KEY, id)
  }

  return (
    <MobilityStyleContext.Provider value={{ styleId, style: MOBILITY_STYLES[styleId], setStyle }}>
      {children}
    </MobilityStyleContext.Provider>
  )
}

export function useMobilityStyle(): MobilityStyle {
  const ctx = useContext(MobilityStyleContext)
  if (!ctx) throw new Error('useMobilityStyle must be used within MobilityStyleProvider')
  return ctx.style
}

export function useMobilityStyleControls(): {
  styleId: MobilityStyleId
  setStyle: (id: MobilityStyleId) => void
} {
  const ctx = useContext(MobilityStyleContext)
  if (!ctx) throw new Error('useMobilityStyleControls must be used within MobilityStyleProvider')
  return { styleId: ctx.styleId, setStyle: ctx.setStyle }
}
