import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from '@/features/home'
import { MapHomeScreen } from '@/features/home/screens/MapHomeScreen'
import { SelectStationScreen } from '@/features/stations'
import { ReportCustomScreen, ReportFormScreen, SuccessScreen } from '@/features/reporting'
import { JourneyDetailScreen, JourneyPlannerScreen, SavedJourneysScreen } from '@/features/journey'
import { SearchScreen } from '@/features/search/screens/SearchScreen'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MapHome" component={MapHomeScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="JourneyPlanner" component={JourneyPlannerScreen} />
      <Stack.Screen name="JourneyDetail" component={JourneyDetailScreen} />
      <Stack.Screen name="SavedJourneys" component={SavedJourneysScreen} />
      <Stack.Screen name="Station" component={HomeScreen} />
      <Stack.Screen name="SelectStation" component={SelectStationScreen} />
      <Stack.Screen name="ReportForm" component={ReportFormScreen} />
      <Stack.Screen name="ReportCustom" component={ReportCustomScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} />
    </Stack.Navigator>
  )
}
