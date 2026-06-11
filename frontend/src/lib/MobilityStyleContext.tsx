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
  funLabels?: string[]
  funIcons?: (keyof typeof MaterialIcons.glyphMap)[]
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
    funLabels: [
      'Zoom', 'Dance', 'Galumph', 'Sashay', 'Mosey', 'Waddle',
      'Shimmy', 'Prance', 'Toddle', 'Scuttle', 'Whoosh', 'Skedaddle',
      'Lumber', 'Swagger', 'Trot', 'Frolic', 'Traipse', 'Stomp',
      'Scamper', 'Saunter', 'Bound', 'Lurch', 'Hustle', 'Tiptoe',
      'Strut', 'Bumble', 'Shuffle', 'Skip', 'Meander', 'Dart',
    ],
    funIcons: [
      'accessible-forward', 'assist-walker', 'nordic-walking', 'directions-walk',
      'directions-run', 'skateboarding', 'celebration', 'bolt',
      'waving-hand', 'auto-awesome', 'sledding', 'emoji-emotions', 'rocket',
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
