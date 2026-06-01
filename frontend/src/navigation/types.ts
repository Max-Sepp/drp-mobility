import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// Stations and equipment types are backend rows (GET /stations, GET /equipment-types). Navigation
// only carries the human-readable station name and the kind of equipment being reported; the
// concrete equipment row (and its id) is resolved on the report screen.
export type Station = string
export type EquipmentType = 'lift' | 'escalator'

export type RootStackParamList = {
  Home: undefined
  SelectStation: { currentStation: Station }
  ReportForm: { equipmentType: EquipmentType; station: Station }
  ReportCustom: { station: Station }
  JourneyPlanner: undefined
  Success: undefined
}

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>
export type SelectStationScreenProps = NativeStackScreenProps<RootStackParamList, 'SelectStation'>
export type ReportFormScreenProps = NativeStackScreenProps<RootStackParamList, 'ReportForm'>
export type ReportCustomScreenProps = NativeStackScreenProps<RootStackParamList, 'ReportCustom'>
export type JourneyPlannerScreenProps = NativeStackScreenProps<RootStackParamList, 'JourneyPlanner'>
export type SuccessScreenProps = NativeStackScreenProps<RootStackParamList, 'Success'>
