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
  | 'fun'

export type MobilityStyle = {
  id: MobilityStyleId
  name: string
  label: string
  description: string
  icon: keyof typeof MaterialIcons.glyphMap
  funPairs?: { label: string; icon: keyof typeof MaterialIcons.glyphMap }[]
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
  fun: {
    id: 'fun',
    name: 'Surprise!',
    label: 'Move',
    description: 'A different word and icon every time',
    icon: 'auto-awesome',
    funPairs: [
      { label: 'Zoom',      icon: 'rocket' },
      { label: 'Dash',      icon: 'bolt' },
      { label: 'Dance',     icon: 'celebration' },
      { label: 'Sashay',    icon: 'auto-awesome' },
      { label: 'Mosey',     icon: 'beach-access' },
      { label: 'Waddle',    icon: 'accessible-forward' },
      { label: 'Shimmy',    icon: 'emoji-emotions' },
      { label: 'Prance',    icon: 'nordic-walking' },
      { label: 'Whoosh',    icon: 'air' },
      { label: 'Skedaddle', icon: 'directions-run' },
      { label: 'Lumber',    icon: 'assist-walker' },
      { label: 'Swagger',   icon: 'local-fire-department' },
      { label: 'Trot',      icon: 'pets' },
      { label: 'Stomp',     icon: 'fitness-center' },
      { label: 'Saunter',   icon: 'explore' },
      { label: 'Tiptoe',    icon: 'spa' },
      { label: 'Shuffle',   icon: 'shuffle' },
      { label: 'Skip',      icon: 'sledding' },
      { label: 'Bumble',    icon: 'hive' },
      { label: 'Toddle',    icon: 'child-care' },
    ],
  },
}

export const DEFAULT_MOBILITY_STYLE_ID: MobilityStyleId = 'navigating'

/** Deterministic index into an array, seeded by leg properties so the same leg always
 *  shows the same fun word/icon regardless of re-renders or navigation. */
export function stablePickIndex(arr: unknown[], seed: string): number {
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = (h * 33 + seed.charCodeAt(i)) & 0x7fffffff
  return h % arr.length
}

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
