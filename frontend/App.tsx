import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { TamaguiProvider } from 'tamagui'
import { tamaguiConfig } from './tamagui.config'
import { LocationProvider } from './src/lib/LocationContext'
import RootNavigator from './src/navigation/RootNavigator'

export default function App() {
  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme="light">
      <SafeAreaProvider>
        <LocationProvider>
          <NavigationContainer>
            <RootNavigator />
            <StatusBar style="auto" />
          </NavigationContainer>
        </LocationProvider>
      </SafeAreaProvider>
    </TamaguiProvider>
  )
}
