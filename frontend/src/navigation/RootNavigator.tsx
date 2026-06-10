import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AccountScreen, LoginScreen, SignupScreen } from '@/features/auth'
import { MapHomeScreen } from '@/features/home/screens/MapHomeScreen'
import type { RootStackParamList } from '@/navigation/types'

const Stack = createNativeStackNavigator<RootStackParamList>()

// The map is the only primary screen — every product flow (search, journey planning, station
// detail, reporting) lives in a bottom sheet rendered by MapHomeScreen. Auth is the sole
// exception: Login/Signup/Account are pushed on top of the map and dismissed with goBack.
export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MapHome" component={MapHomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="Account" component={AccountScreen} />
    </Stack.Navigator>
  )
}
