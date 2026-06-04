import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TamaguiProvider } from 'tamagui'
import { tamaguiConfig } from './tamagui.config'
import { AuthProvider } from './src/features/auth'
import { usePushNotifications } from './src/hooks/usePushNotifications'
import { navigationRef } from './src/navigation/navigationRef'
import RootNavigator from './src/navigation/RootNavigator'

// Separate component so usePushNotifications can access AuthContext via useAuth().
function AppContent() {
  usePushNotifications()
  return (
    <SafeAreaProvider>
      <NavigationContainer ref={navigationRef}>
        <RootNavigator />
        <StatusBar style="auto" />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}

export default function App() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </TamaguiProvider>
  )
}
