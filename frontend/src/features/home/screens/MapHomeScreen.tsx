import { MaterialIcons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StationMap } from '@/features/map/components/StationMap'
import { loadSavedJourneys, type SavedJourney } from '@/features/journey/api/savedJourneys'
import {
  clearActiveJourney,
  loadActiveJourney,
  type ActiveJourney,
} from '@/features/journey/api/activeJourney'
import {
  addCustomPlace,
  clearPlace,
  loadSavedPlaces,
  removeCustomPlace,
  savePlace,
  type CustomPlace,
  type SavedPlaces,
} from '@/features/journey/api/savedPlaces'
import { humanizeSummary } from '@/features/journey/components/legDisplay'
import { useAuth } from '@/features/auth'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/navigation/types'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import { Colors, Radii, Shadows, Spacing, Typography } from '@/theme'
import {
  SearchActionSheet,
  type SearchActionSheetHandle,
} from '@/features/home/components/SearchActionSheet'
import { SetPlaceModal } from '@/features/home/components/SetPlaceModal'
import { AddCustomPlaceModal } from '@/features/home/components/AddCustomPlaceModal'

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

/** Banner shown over the map while a journey is being followed, to resume or end it. */
function ActiveJourneyBanner({
  active,
  onResume,
  onEnd,
}: {
  active: ActiveJourney
  onResume: () => void
  onEnd: () => void
}) {
  const leg = active.journey.legs[active.currentLegIndex]
  const subtitle = leg
    ? humanizeSummary(leg.instruction.summary, [active.from, active.to])
    : 'Tap to resume'
  return (
    <View style={styles.banner}>
      <View style={styles.bannerPulse} />
      <View style={{ flex: 1 }}>
        <Text style={styles.bannerTitle}>Journey in progress</Text>
        <Text style={styles.bannerSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onResume}
        style={styles.resumeButton}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Resume journey"
      >
        <Text style={styles.resumeText}>Resume</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onEnd}
        style={styles.endButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="End journey"
      >
        <MaterialIcons name="close" size={20} color={Colors.secondaryText} />
      </TouchableOpacity>
    </View>
  )
}

export function MapHomeScreen({ navigation }: Props) {
  const [saved, setSaved] = useState<SavedJourney[]>([])
  const [active, setActive] = useState<ActiveJourney | null>(null)
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaces>({ custom: [] })
  const [setPlaceModal, setSetPlaceModal] = useState<{ key: 'home' | 'work' } | null>(null)
  const [addCustomPlaceVisible, setAddCustomPlaceVisible] = useState(false)
  const sheetRef = useRef<SearchActionSheetHandle>(null)
  const { status, user, signOut } = useAuth()

  // Refresh on focus so the banner reflects progress made on the active screen and survives a
  // restart (the record is read from storage each time the map regains focus).
  useFocusEffect(
    useCallback(() => {
      loadSavedJourneys().then(setSaved)
      loadActiveJourney().then(setActive)
      if (user) loadSavedPlaces(user.id).then(setSavedPlaces)
      else setSavedPlaces({ custom: [] })
    }, [user]),
  )

  function handlePlacePress(key: 'home' | 'work') {
    if (status === 'loading') return
    if (status !== 'authed' || !user) {
      navigation.navigate('Login')
      return
    }
    const place = savedPlaces[key]
    if (!place) {
      setSetPlaceModal({ key })
      return
    }
    const label = key === 'home' ? 'Home' : 'Work'
    navigation.navigate('JourneyPlanner', {
      initialTo: { postcode: place.postcode, label, isNamedPlace: true },
    })
  }

  function handlePlaceLongPress(key: 'home' | 'work') {
    if (status !== 'authed' || !user) return
    const place = savedPlaces[key]
    if (!place) {
      setSetPlaceModal({ key })
      return
    }
    const label = key === 'home' ? 'Home' : 'Work'
    Alert.alert(`${label}: ${place.address}`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: `Change ${label}`,
        onPress: () => setSetPlaceModal({ key }),
      },
      {
        text: `Remove ${label}`,
        style: 'destructive',
        onPress: async () => {
          await clearPlace(user.id, key)
          setSavedPlaces((prev) => {
            const next = { ...prev }
            delete next[key]
            return next
          })
        },
      },
    ])
  }

  async function handleSavePlace(address: string, postcode: string) {
    if (!user || !setPlaceModal) return
    const key = setPlaceModal.key
    await savePlace(user.id, key, { address, postcode })
    const updated = await loadSavedPlaces(user.id)
    setSavedPlaces(updated)
    setSetPlaceModal(null)
  }

  function handleAddCustomPlacePress() {
    if (status === 'loading') return
    if (status !== 'authed' || !user) {
      navigation.navigate('Login')
      return
    }
    setAddCustomPlaceVisible(true)
  }

  async function handleSaveCustomPlace(place: Omit<CustomPlace, 'id'>) {
    if (!user) return
    await addCustomPlace(user.id, place)
    const updated = await loadSavedPlaces(user.id)
    setSavedPlaces(updated)
    setAddCustomPlaceVisible(false)
  }

  function handleCustomPlacePress(place: CustomPlace) {
    navigation.navigate('JourneyPlanner', {
      initialTo: { postcode: place.postcode, label: place.name, isNamedPlace: true },
    })
  }

  function handleCustomPlaceLongPress(place: CustomPlace) {
    if (!user) return
    Alert.alert(place.name, place.address, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeCustomPlace(user.id, place.id)
          const updated = await loadSavedPlaces(user.id)
          setSavedPlaces(updated)
        },
      },
    ])
  }

  function resumeActive(item: ActiveJourney) {
    navigation.navigate('ActiveJourney', {
      savedId: item.savedId,
      journey: item.journey,
      from: item.from,
      to: item.to,
      outages: item.outages,
      level: item.level,
    })
  }

  function endActive() {
    Alert.alert(
      'End journey?',
      'This stops following the route. It stays in your saved journeys.',
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'End journey',
          style: 'destructive',
          onPress: async () => {
            await clearActiveJourney()
            setActive(null)
          },
        },
      ],
    )
  }

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

      {/* Top overlay: icon buttons, then a resume banner when a journey is in progress */}
      <SafeAreaView edges={['top']} style={[styles.topSafe, { pointerEvents: 'box-none' }]}>
        <View style={[styles.topButtons, { pointerEvents: 'box-none' }]}>
          <TopIconButton
            icon="accessible"
            onPress={() =>
              Alert.alert('Coming soon', 'Accessibility settings are not yet available.')
            }
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
        {active && (
          <ActiveJourneyBanner
            active={active}
            onResume={() => resumeActive(active)}
            onEnd={endActive}
          />
        )}
      </SafeAreaView>

      {/* Bottom action sheet — slides up in place, no new screen */}
      <SearchActionSheet
        ref={sheetRef}
        savedJourneys={saved}
        savedPlaces={savedPlaces}
        onSavedJourneyPress={openSaved}
        onStationPress={openStation}
        onLocationSelect={openJourneyFromTo}
        onPlacePress={handlePlacePress}
        onPlaceLongPress={handlePlaceLongPress}
        onCustomPlacePress={handleCustomPlacePress}
        onCustomPlaceLongPress={handleCustomPlaceLongPress}
        onAddCustomPlace={handleAddCustomPlacePress}
      />

      {setPlaceModal && (
        <SetPlaceModal
          visible
          placeKey={setPlaceModal.key}
          onSave={handleSavePlace}
          onDismiss={() => setSetPlaceModal(null)}
        />
      )}

      <AddCustomPlaceModal
        visible={addCustomPlaceVisible}
        onSave={handleSaveCustomPlace}
        onDismiss={() => setAddCustomPlaceVisible(false)}
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
    left: 0,
    right: 0,
  },
  topButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.card,
    borderRadius: Radii.card,
    ...Shadows.card,
  },
  bannerPulse: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.blue,
  },
  bannerTitle: {
    ...Typography.bodyBold,
    color: Colors.text,
  },
  bannerSubtitle: {
    ...Typography.caption,
    color: Colors.secondaryText,
  },
  resumeButton: {
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: Radii.pill,
    backgroundColor: Colors.blue,
  },
  resumeText: {
    ...Typography.bodyBold,
    color: Colors.card,
  },
  endButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
