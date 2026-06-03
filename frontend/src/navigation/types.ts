import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// Stations and equipment types are backend rows (GET /stations, GET /equipment-types). Navigation
// only carries the human-readable station name and the kind of equipment being reported; the
// concrete equipment row (and its id) is resolved on the report screen.
export type Station = string
export type EquipmentType = 'lift' | 'escalator'

export type RootStackParamList = {
  JourneyPlanner: undefined
  // The station-specific screen (platform access, quick reports, station picker). Reached by
  // tapping a station in a planned journey; `station` is optional so it can also open standalone.
  Station: { station?: Station }
  SelectStation: { currentStation: Station }
  ReportForm: { equipmentType: EquipmentType; station: Station }
  ReportCustom: { station: Station }
  Success: undefined
}

export type JourneyPlannerScreenProps = NativeStackScreenProps<RootStackParamList, 'JourneyPlanner'>
export type StationScreenProps = NativeStackScreenProps<RootStackParamList, 'Station'>
export type SelectStationScreenProps = NativeStackScreenProps<RootStackParamList, 'SelectStation'>
export type ReportFormScreenProps = NativeStackScreenProps<RootStackParamList, 'ReportForm'>
export type ReportCustomScreenProps = NativeStackScreenProps<RootStackParamList, 'ReportCustom'>
export type SuccessScreenProps = NativeStackScreenProps<RootStackParamList, 'Success'>
