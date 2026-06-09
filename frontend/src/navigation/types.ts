import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { AccessibilityPreference, Journey, RouteTag } from '@/features/journey/api/tfl'

// Stations are backend rows (GET /stations). Navigation only carries the human-readable station
// name; the concrete station row is resolved on screen.
export type Station = string

export type RootStackParamList = {
  MapHome: undefined
  Search: undefined
  JourneyPlanner: { initialFrom?: ResolvedLocation; initialTo?: ResolvedLocation } | undefined
  // The expanded view of a single journey. `savedId` is set when opened from the saved list, so
  // the screen can show Remove instead of Save. The journey and its context are plain JSON.
  JourneyDetail: {
    journey: Journey
    from?: ResolvedLocation
    to?: ResolvedLocation
    outages?: StationOutage[]
    level?: AccessibilityPreference | null
    savedId?: string
    tags?: RouteTag[]
  }
  // The follow/execute screen for an in-progress journey. Mirrors JourneyDetail's payload plus
  // the savedId every active journey is anchored to (the detail screen saves before starting).
  ActiveJourney: {
    savedId: string
    journey: Journey
    from?: ResolvedLocation
    to?: ResolvedLocation
    outages?: StationOutage[]
    level?: AccessibilityPreference | null
  }
  // The station-specific screen (platform access, quick reports, station picker). Reached by
  // tapping a station in a planned journey; `station` is optional so it can also open standalone.
  Station: { station?: Station }
  SelectStation: { currentStation: Station }
  // Auth is optional: these are pushed on top of the normal stack (e.g. from the header) and
  // dismissed with goBack on success or cancel — there is no login wall.
  Login: undefined
  Signup: undefined
  Account: undefined
}

export type MapHomeScreenProps = NativeStackScreenProps<RootStackParamList, 'MapHome'>
export type SearchScreenProps = NativeStackScreenProps<RootStackParamList, 'Search'>
export type JourneyPlannerScreenProps = NativeStackScreenProps<RootStackParamList, 'JourneyPlanner'>
export type JourneyDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'JourneyDetail'>
export type ActiveJourneyScreenProps = NativeStackScreenProps<RootStackParamList, 'ActiveJourney'>
export type StationScreenProps = NativeStackScreenProps<RootStackParamList, 'Station'>
export type SelectStationScreenProps = NativeStackScreenProps<RootStackParamList, 'SelectStation'>
export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>
export type SignupScreenProps = NativeStackScreenProps<RootStackParamList, 'Signup'>
export type AccountScreenProps = NativeStackScreenProps<RootStackParamList, 'Account'>
