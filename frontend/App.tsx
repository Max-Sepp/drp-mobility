import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TamaguiProvider } from 'tamagui'
import { tamaguiConfig } from './tamagui.config'
import { AuthProvider } from './src/features/auth'
import { ThemeProvider } from './src/theme'
import { OutageProvider } from './src/features/outages'
import { usePushNotifications } from './src/hooks/usePushNotifications'
import { LocationProvider } from './src/lib/LocationContext'
import { AccessibilityPreferenceProvider } from './src/lib/AccessibilityPreferenceContext'
import { MobilityStyleProvider } from './src/lib/MobilityStyleContext'
import { WorkShiftProvider } from './src/lib/WorkShiftContext'
import { navigationRef } from './src/navigation/navigationRef'
import RootNavigator from './src/navigation/RootNavigator'
import { SheetStackProvider } from './src/components/SheetStack'

// Separate component so usePushNotifications can access AuthContext via useAuth().
function AppContent() {
  usePushNotifications()
  return (
    <OutageProvider>
      <SafeAreaProvider>
        <SheetStackProvider>
          <LocationProvider>
            <NavigationContainer ref={navigationRef}>
              <RootNavigator />
              <StatusBar style="auto" />
            </NavigationContainer>
          </LocationProvider>
        </SheetStackProvider>
      </SafeAreaProvider>
    </OutageProvider>
  )
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <MobilityStyleProvider>
          <AccessibilityPreferenceProvider>
            <WorkShiftProvider>
              <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
                <AuthProvider>
                  <AppContent />
                </AuthProvider>
              </TamaguiProvider>
            </WorkShiftProvider>
          </AccessibilityPreferenceProvider>
        </MobilityStyleProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}
