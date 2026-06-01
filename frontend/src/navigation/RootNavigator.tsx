import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { HomeScreen } from '@/features/home'
import { SelectStationScreen } from '@/features/stations'
import { ReportCustomScreen, ReportFormScreen, SuccessScreen } from '@/features/reporting'
import type { RootStackParamList } from './types'

const Stack = createNativeStackNavigator<RootStackParamList>()

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="SelectStation" component={SelectStationScreen} />
      <Stack.Screen name="ReportForm" component={ReportFormScreen} />
      <Stack.Screen name="ReportCustom" component={ReportCustomScreen} />
      <Stack.Screen name="Success" component={SuccessScreen} />
    </Stack.Navigator>
  )
}
