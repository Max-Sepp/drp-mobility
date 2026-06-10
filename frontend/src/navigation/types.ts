import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// Stations are backend rows (GET /stations). Navigation/sheets carry only the human-readable
// station name; the concrete equipment row (and its id) is resolved where a report is composed.
export type Station = string

export type RootStackParamList = {
  // The map is the only "primary" screen — every product flow lives in a bottom sheet rendered
  // by MapHomeScreen. `station` is an optional deep-link param: a tapped push notification routes
  // here with the station name, which opens that station's sheet.
  MapHome: { station?: string } | undefined
  // Auth is optional: these are pushed on top of the map (e.g. from the header) and dismissed
  // with goBack on success or cancel — there is no login wall.
  Login: undefined
  Signup: undefined
  Account: undefined
}

export type MapHomeScreenProps = NativeStackScreenProps<RootStackParamList, 'MapHome'>
export type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>
export type SignupScreenProps = NativeStackScreenProps<RootStackParamList, 'Signup'>
export type AccountScreenProps = NativeStackScreenProps<RootStackParamList, 'Account'>
