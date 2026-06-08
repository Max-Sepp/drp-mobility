import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AccountScreen, LoginScreen, SignupScreen } from '@/features/auth'
import { StationScreen } from '@/features/home'
import { MapHomeScreen } from '@/features/home/screens/MapHomeScreen'
import { SelectStationScreen } from '@/features/stations'
import { ReportCustomScreen, ReportFormScreen, SuccessScreen } from '@/features/reporting'
import {
  ActiveJourneyScreen,
  JourneyDetailScreen,
  JourneyPlannerScreen,
} from '@/features/journey'
import { SearchScreen } from '@/features/search/screens/SearchScreen'
import type { RootStackParamList } from '@/navigation/types'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MapHome" component={MapHomeScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="JourneyPlanner" component={JourneyPlannerScreen} />
      <Stack.Screen name="JourneyDetail" component={JourneyDetailScreen} />
      {/* gestureEnabled off so a swipe-back can't silently abandon a journey — back runs a confirm. */}
      <Stack.Screen
        name="ActiveJourney"
        component={ActiveJourneyScreen}
        options={{ gestureEnabled: false }}
      />
      <Stack.Screen name="Station" component={StationScreen} />
      <Stack.Screen name="SelectStation" component={SelectStationScreen} />
      <Stack.Screen name="ReportForm" component={ReportFormScreen} />
      <Stack.Screen name="ReportCustom" component={ReportCustomScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Account" component={AccountScreen} />
    </Stack.Navigator>
  )
}
