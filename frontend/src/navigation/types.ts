import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { StationOutage } from '@/features/journey/api/accessibility'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { AccessibilityPreference, Journey, RouteTag } from '@/features/journey/api/tfl'

// Stations and equipment types are backend rows (GET /stations, GET /equipment-types). Navigation
// only carries the human-readable station name and the kind of equipment being reported; the
// concrete equipment row (and its id) is resolved on the report screen.
export type Station = string
export type EquipmentType = 'lift' | 'escalator'

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
  // The list of journeys saved to the device.
  SavedJourneys: undefined
  // The station-specific screen (platform access, quick reports, station picker). Reached by
  // tapping a station in a planned journey; `station` is optional so it can also open standalone.
  Station: { station?: Station }
  SelectStation: { currentStation: Station }
  ReportForm: { equipmentType: EquipmentType; station: Station }
  ReportCustom: { station: Station }
  Success: undefined
}

export type MapHomeScreenProps = NativeStackScreenProps<RootStackParamList, 'MapHome'>
export type SearchScreenProps = NativeStackScreenProps<RootStackParamList, 'Search'>
export type JourneyPlannerScreenProps = NativeStackScreenProps<RootStackParamList, 'JourneyPlanner'>
export type JourneyDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'JourneyDetail'>
export type SavedJourneysScreenProps = NativeStackScreenProps<RootStackParamList, 'SavedJourneys'>
export type StationScreenProps = NativeStackScreenProps<RootStackParamList, 'Station'>
export type SelectStationScreenProps = NativeStackScreenProps<RootStackParamList, 'SelectStation'>
export type ReportFormScreenProps = NativeStackScreenProps<RootStackParamList, 'ReportForm'>
export type ReportCustomScreenProps = NativeStackScreenProps<RootStackParamList, 'ReportCustom'>
export type SuccessScreenProps = NativeStackScreenProps<RootStackParamList, 'Success'>
