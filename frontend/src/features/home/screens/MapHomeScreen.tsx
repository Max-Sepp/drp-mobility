import { MaterialIcons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useRef, useState } from 'react'
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StationMap } from '@/features/map/components/StationMap'
import { loadSavedJourneys, type SavedJourney } from '@/features/journey/api/savedJourneys'
import { useAuth } from '@/features/auth'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/navigation/types'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import { Colors, Shadows, Spacing } from '@/theme'
import {
  SearchActionSheet,
  type SearchActionSheetHandle,
} from '@/features/home/components/SearchActionSheet'

type Props = NativeStackScreenProps<RootStackParamList, 'MapHome'>

function TopIconButton({
  icon,
  onPress,
  color = Colors.text,
  accessibilityLabel,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  color?: string
  accessibilityLabel?: string
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.topButton}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <MaterialIcons name={icon} size={22} color={color} />
    </TouchableOpacity>
  )
}

export function MapHomeScreen({ navigation }: Props) {
  const [saved, setSaved] = useState<SavedJourney[]>([])
  const sheetRef = useRef<SearchActionSheetHandle>(null)
  const { status, user, signOut } = useAuth()

  useFocusEffect(
    useCallback(() => {
      loadSavedJourneys().then(setSaved)
    }, []),
  )

  // The person icon doubles as the account affordance: log in when anonymous, or show the current
  // user with a log-out option when authenticated. A confirm step guards against an accidental tap.
  function handleAccountPress() {
    if (status === 'authed' && user) {
      Alert.alert(`Logged in as ${user.username}`, undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log out', style: 'destructive', onPress: () => void signOut() },
      ])
    } else {
      navigation.navigate('Login')
    }
  }

  function openSaved(item: SavedJourney) {
    navigation.navigate('JourneyDetail', {
      journey: item.journey,
      from: item.from,
      to: item.to,
      outages: item.outages,
      level: item.level,
      savedId: item.id,
    })
  }

  function openStation(stationName: string) {
    navigation.navigate('Station', { station: stationName })
  }

  function openJourneyFromTo(from: ResolvedLocation | undefined, to: ResolvedLocation) {
    navigation.navigate('JourneyPlanner', { initialFrom: from, initialTo: to })
  }

  return (
    <View style={styles.screen}>
      {/* Map fills the entire screen background */}
      <StationMap onStationPress={openStation} />

      {/* Top-right icon buttons, safe-area aware */}
      <SafeAreaView edges={['top']} style={[styles.topSafe, { pointerEvents: 'box-none' }]}>
        <View style={styles.topButtons}>
          <TopIconButton
            icon="accessible"
            onPress={() => Alert.alert('Coming soon', 'Accessibility settings are not yet available.')}
          />
          {status !== 'loading' && (
            <TopIconButton
              icon={status === 'authed' ? 'account-circle' : 'person'}
              color={status === 'authed' ? Colors.blue : Colors.text}
              accessibilityLabel={
                status === 'authed' && user ? `Logged in as ${user.username}` : 'Log in'
              }
              onPress={handleAccountPress}
            />
          )}
        </View>
      </SafeAreaView>

      {/* Bottom action sheet — slides up in place, no new screen */}
      <SearchActionSheet
        ref={sheetRef}
        savedJourneys={saved}
        onSavedJourneyPress={openSaved}
        onStationPress={openStation}
        onLocationSelect={openJourneyFromTo}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.mapBg,
  },
  topSafe: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  topButtons: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 8,
    paddingRight: Spacing.md,
  },
  topButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
})
