import type { components } from '@/api/schema.d'

// The backend exposes two step-free scales: a coarse station summary (derived from platforms)
// and the finer per-platform value. Both share the "none"/"to_platform" levels.
export type StationStepFree = components['schemas']['StepFree']
export type PlatformStepFree = components['schemas']['PlatformStepFree']
type AnyStepFree = StationStepFree | PlatformStepFree

export type StepFreePresentation = {
  /** Full label for headers / breakdown rows. */
  label: string
  /** Compact label for tight spaces like list-row badges. */
  short: string
  /** Whether any step-free access exists (drives icon + colour). */
  accessible: boolean
  /** MaterialIcons glyph name. */
  icon: 'accessible' | 'not-accessible'
  /** Foreground (text/icon) colour. */
  color: string
  /** Badge background colour. */
  background: string
}

const ACCESSIBLE_GREEN = { accessible: true, icon: 'accessible', color: '#166534', background: '#dcfce7' } as const
const PARTIAL_AMBER = { accessible: true, icon: 'accessible', color: '#92400e', background: '#fef3c7' } as const
const NONE_RED = { accessible: false, icon: 'not-accessible', color: '#991b1b', background: '#fee2e2' } as const

// Keyed by every value either scale can produce, so one map serves stations and platforms.
const PRESENTATION: Record<AnyStepFree, StepFreePresentation> = {
  none: { label: 'No step-free access', short: 'None', ...NONE_RED },
  to_platform: { label: 'Step-free to platform', short: 'To platform', ...PARTIAL_AMBER },
  to_vehicle: { label: 'Step-free to train', short: 'To train', ...ACCESSIBLE_GREEN },
  to_train: { label: 'Step-free to train', short: 'To train', ...ACCESSIBLE_GREEN },
  full: { label: 'Full step-free access', short: 'Full', ...ACCESSIBLE_GREEN },
}

export function stepFreePresentation(value: AnyStepFree): StepFreePresentation {
  return PRESENTATION[value]
}
