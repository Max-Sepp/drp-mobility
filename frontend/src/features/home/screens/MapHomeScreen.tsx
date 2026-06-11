import { MaterialIcons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StationMap, type StationMapHandle } from '@/features/map/components/StationMap'
import { useAppLocation } from '@/lib/LocationContext'
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
import { useTheme, Spacing, Typography } from '@/theme'
import {
  SearchActionSheet,
  type SearchActionSheetHandle,
} from '@/features/home/components/SearchActionSheet'
import { StationSheet } from '@/features/home/components/StationSheet'
import { ReportSheet } from '@/features/home/components/ReportSheet'
import {
  JourneyPlannerSheet,
  type JourneyPlan,
} from '@/features/home/components/JourneyPlannerSheet'
import {
  JourneyDetailSheet,
  type JourneyDetailParams,
  type ActiveJourneyParams,
} from '@/features/home/components/JourneyDetailSheet'
import { ActiveJourneySheet } from '@/features/home/components/ActiveJourneySheet'
import { SetPlaceModal } from '@/features/home/components/SetPlaceModal'
import { AddCustomPlaceModal } from '@/features/home/components/AddCustomPlaceModal'

type Props = NativeStackScreenProps<RootStackParamList, 'MapHome'>

function TopIconButton({
  icon,
  onPress,
  color,
  size = 40,
  accessibilityLabel,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  onPress: () => void
  color?: string
  size?: number
  accessibilityLabel?: string
}) {
  const { Colors } = useTheme()
  const topButtonStyle = useMemo(
    () => ({
      backgroundColor: Colors.card,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    }),
    [Colors],
  )
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[topButtonStyle, { width: size, height: size, borderRadius: size / 2 }]}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <MaterialIcons name={icon} size={size * 0.55} color={color ?? Colors.text} />
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
  const { Colors, Radii, Shadows } = useTheme()
  const bannerStyles = useMemo(
    () =>
      StyleSheet.create({
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
      }),
    [Colors, Radii, Shadows],
  )
  const leg = active.journey.legs[active.currentLegIndex]
  const subtitle = leg
    ? humanizeSummary(leg.instruction.summary, [active.from, active.to])
    : 'Tap to resume'
  return (
    <View style={bannerStyles.banner}>
      <View style={bannerStyles.bannerPulse} />
      <View style={{ flex: 1 }}>
        <Text style={bannerStyles.bannerTitle}>Journey in progress</Text>
        <Text style={bannerStyles.bannerSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onResume}
        style={bannerStyles.resumeButton}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Resume journey"
      >
        <Text style={bannerStyles.resumeText}>Resume</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onEnd}
        style={bannerStyles.endButton}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="End journey"
      >
        <MaterialIcons name="close" size={20} color={Colors.secondaryText} />
      </TouchableOpacity>
    </View>
  )
}

export function MapHomeScreen({ navigation, route }: Props) {
  const { Colors, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
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
          justifyContent: 'space-between',
          paddingTop: 8,
          paddingHorizontal: Spacing.md,
        },
        topButton: {
          backgroundColor: Colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          ...Shadows.card,
        },
      }),
    [Colors, Shadows],
  )
  const [saved, setSaved] = useState<SavedJourney[]>([])
  const [active, setActive] = useState<ActiveJourney | null>(null)
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaces>({ custom: [] })
  const [setPlaceModal, setSetPlaceModal] = useState<{ key: 'home' | 'work' } | null>(null)
  const [addCustomPlaceVisible, setAddCustomPlaceVisible] = useState(false)
  const [activeStation, setActiveStation] = useState<string | null>(null)
  const [stationPausedForJourney, setStationPausedForJourney] = useState(false)
  const [activeReport, setActiveReport] = useState<string | null>(null)
  const [activePlan, setActivePlan] = useState<JourneyPlan | null>(null)
  const [activeDetail, setActiveDetail] = useState<JourneyDetailParams | null>(null)
  const [activeJourneyParams, setActiveJourneyParams] = useState<ActiveJourneyParams | null>(null)
  const sheetRef = useRef<SearchActionSheetHandle>(null)
  const mapRef = useRef<StationMapHandle>(null)
  const { status, user } = useAuth()
  const coords = useAppLocation()
  // Each sheet reports its current snap height; the map uses the tallest one as its bottom inset.
  const [searchHeight, setSearchHeight] = useState(Dimensions.get('window').height * 0.5)
  const [stationHeight, setStationHeight] = useState(0)
  const [reportHeight, setReportHeight] = useState(0)
  const [plannerHeight, setPlannerHeight] = useState(0)
  const [detailHeight, setDetailHeight] = useState(0)
  const [activeJourneyHeight, setActiveJourneyHeight] = useState(0)
  const mapBottomInset = Math.max(
    searchHeight,
    stationHeight,
    reportHeight,
    plannerHeight,
    detailHeight,
    activeJourneyHeight,
  )
  // The sheets that expand to full height all snap to `SCREEN_H - insets.top - 66`, leaving just
  // enough room for the top buttons. When a sheet reaches that height it covers the map entirely
  // (e.g. the route overview), so the re-centre/account buttons are hidden to avoid floating over it.
  const insets = useSafeAreaInsets()
  const sheetIsFullscreen =
    mapBottomInset >= Dimensions.get('window').height - insets.top - 66

  // The search sheet is the resting state of the map. Any other flow (a station, a plan, a journey
  // detail/active journey, or a report) takes over the screen, so the search sheet is dismissed
  // while one is open and restored only once they all close. Driving this declaratively from state
  // avoids the imperative dismiss()/restore() calls racing with sheet close animations.
  const overlayActive = Boolean(
    activeStation || activePlan || activeDetail || activeJourneyParams || activeReport,
  )
  useEffect(() => {
    if (overlayActive) sheetRef.current?.dismiss()
    else sheetRef.current?.restore()
  }, [overlayActive])

  // Refresh on focus so the banner reflects progress made on the active screen and survives a
  // restart (the record is read from storage each time the map regains focus).
  useFocusEffect(
    useCallback(() => {
      if (status === 'loading') return
      loadSavedJourneys().then(setSaved)
      loadActiveJourney().then(setActive)
      if (user) loadSavedPlaces(user.id).then(setSavedPlaces)
      else setSavedPlaces({ custom: [] })
    }, [status, user]),
  )

  // Deep link from a tapped push notification: navigation routes to MapHome with a `station`
  // param. Open that station's sheet, then clear the param so re-tapping the same station
  // (param goes undefined → station) opens it again.
  const stationParam = route.params?.station
  useEffect(() => {
    if (!stationParam) return
    openStation(stationParam)
    navigation.setParams({ station: undefined })
  }, [stationParam]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setActivePlan({ initialTo: { postcode: place.postcode, label, isNamedPlace: true } })
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
    const lowerName = place.name.toLowerCase()
    if (lowerName === 'home' || lowerName === 'work') {
      const key = lowerName as 'home' | 'work'
      await savePlace(user.id, key, { address: place.address, postcode: place.postcode })
    } else {
      await addCustomPlace(user.id, place)
    }
    const updated = await loadSavedPlaces(user.id)
    setSavedPlaces(updated)
    setAddCustomPlaceVisible(false)
  }

  function handleCustomPlacePress(place: CustomPlace) {
    setActivePlan({
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
    setActiveJourneyParams({
      savedId: item.savedId,
      journey: item.journey,
      from: item.from,
      to: item.to,
      outages: item.outages,
      level: item.level,
    })
  }

  // The person icon doubles as the account affordance: log in when anonymous, or show the current
  // user with a log-out option when authenticated. A confirm step guards against an accidental tap.
  function handleAccountPress() {
    if (status === 'authed') {
      navigation.navigate('Account')
    } else {
      navigation.navigate('Login')
    }
  }

  function openSaved(item: SavedJourney) {
    setActiveDetail({
      journey: item.journey,
      from: item.from,
      to: item.to,
      outages: item.outages,
      level: item.level,
      savedId: item.id,
    })
  }

  function openStation(stationName: string) {
    setActiveStation(stationName)
  }

  function closeStation() {
    setActiveStation(null)
    setStationPausedForJourney(false)
  }

  function openJourneyFromTo(from: ResolvedLocation | undefined, to: ResolvedLocation) {
    setActivePlan({ initialFrom: from, initialTo: to })
  }

  function closePlan() {
    setActivePlan(null)
    // Un-pause the station the plan may have been opened from, so it reappears when the user backs
    // out of planning. If a journey was started instead, the station was already cleared, so this
    // is a no-op and the station stays hidden behind the active journey.
    setStationPausedForJourney(false)
  }

  return (
    <View style={styles.screen}>
      <StationMap ref={mapRef} onStationPress={openStation} bottomInset={mapBottomInset} />

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
        onSnapChange={setSearchHeight}
      />

      {/* Sheet render order = z-order (later renders on top). Constraints: a station opened from
          an active journey must sit above it; the report sheet slides over the station sheet; the
          journey detail sheet sits over the planner. Hence: ActiveJourney < Planner < Detail <
          Station < Report. */}
      <ActiveJourneySheet
        params={activeJourneyParams}
        onStationPress={openStation}
        onComplete={() => {
          setActiveJourneyParams(null)
          setActive(null)
        }}
        onEnd={() => {
          setActiveJourneyParams(null)
          setActive(null)
        }}
        onHeightChange={setActiveJourneyHeight}
      />

      <JourneyPlannerSheet
        plan={activePlan}
        onClose={closePlan}
        onJourneySelect={(params) => setActiveDetail(params)}
        savedPlaces={savedPlaces}
        onHeightChange={setPlannerHeight}
      />

      <JourneyDetailSheet
        params={activeDetail}
        onClose={() => setActiveDetail(null)}
        onSaveChanged={() => loadSavedJourneys().then(setSaved)}
        onStartJourney={(params) => {
          setActiveDetail(null)
          setActivePlan(null)
          // Fully tear down any station that the plan was started from, so it can't reappear over
          // the route once the active journey is the only open flow.
          setActiveStation(null)
          setStationPausedForJourney(false)
          setActiveJourneyParams(params)
        }}
        onHeightChange={setDetailHeight}
      />

      <StationSheet
        station={stationPausedForJourney ? null : activeStation}
        onClose={closeStation}
        onReportPress={() => activeStation && setActiveReport(activeStation)}
        onOpenJourney={(plan) => {
          setStationPausedForJourney(true)
          setActivePlan(plan)
        }}
        onHeightChange={setStationHeight}
      />

      <ReportSheet
        station={activeReport}
        onClose={() => setActiveReport(null)}
        onHeightChange={setReportHeight}
      />

      {/* Top overlay: rendered after sheets so it sits above all backdrops */}
      <SafeAreaView edges={['top']} style={[styles.topSafe, { pointerEvents: 'box-none' }]}>
        {!sheetIsFullscreen && (
          <View style={[styles.topButtons, { pointerEvents: 'box-none' }]}>
            <TopIconButton
              icon="my-location"
              size={50}
              color={coords ? Colors.blue : Colors.secondaryText}
              accessibilityLabel="Re-centre map on my location"
              onPress={() => mapRef.current?.recentre()}
            />
            <TopIconButton
              icon={status === 'authed' ? 'account-circle' : 'person'}
              color={status === 'authed' ? Colors.blue : Colors.text}
              size={50}
              accessibilityLabel={
                status === 'authed' && user ? `Logged in as ${user.username}` : 'Log in'
              }
              onPress={handleAccountPress}
            />
          </View>
        )}
        {active && !activeJourneyParams && (
          <ActiveJourneyBanner
            active={active}
            onResume={() => resumeActive(active)}
            onEnd={async () => {
              await clearActiveJourney()
              setActive(null)
            }}
          />
        )}
      </SafeAreaView>

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
        existingNames={[
          ...(savedPlaces.home ? ['Home'] : []),
          ...(savedPlaces.work ? ['Work'] : []),
          ...savedPlaces.custom.map((p) => p.name),
        ]}
        onSave={handleSaveCustomPlace}
        onDismiss={() => setAddCustomPlaceVisible(false)}
      />
    </View>
  )
}
