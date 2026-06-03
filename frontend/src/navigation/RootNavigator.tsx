import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { LoginScreen, SignupScreen } from '@/features/auth'
import { HomeScreen } from '@/features/home'
import { SelectStationScreen } from '@/features/stations'
import { ReportCustomScreen, ReportFormScreen, SuccessScreen } from '@/features/reporting'
import { JourneyDetailScreen, JourneyPlannerScreen, SavedJourneysScreen } from '@/features/journey'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="JourneyPlanner" component={JourneyPlannerScreen} />
      <Stack.Screen name="JourneyDetail" component={JourneyDetailScreen} />
      <Stack.Screen name="SavedJourneys" component={SavedJourneysScreen} />
      <Stack.Screen name="Station" component={HomeScreen} />
      <Stack.Screen name="SelectStation" component={SelectStationScreen} />
      <Stack.Screen name="ReportForm" component={ReportFormScreen} />
      <Stack.Screen name="ReportCustom" component={ReportCustomScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  )
}
