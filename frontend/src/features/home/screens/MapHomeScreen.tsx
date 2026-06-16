import { MaterialIcons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Alert, Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { StationMap, type StationMapHandle } from '@/features/map/components/StationMap'
import { useAppLocation } from '@/lib/LocationContext'
import { useWorkShift } from '@/lib/WorkShiftContext'
import { useStations } from '@/features/stations'
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
import { journeyToRouteGeometry } from '@/features/journey/lib/routeGeometry'
import { useAuth } from '@/features/auth'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/navigation/types'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { Journey } from '@/features/journey/api/tfl'
import type { LatLng } from '@/features/journey/lib/routeGeometry'
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

/**
 * Compact bar shown to a staff member who is on shift. It sits between the top map buttons and,
 * when tapped, jumps straight to their station's sheet (the lower view) — no search needed.
 */
function ShiftBanner({ station, onJump }: { station: string; onJump: () => void }) {
  const { Colors, Radii, Shadows } = useTheme()
  const bannerStyles = useMemo(
    () =>
      StyleSheet.create({
        banner: {
          flex: 1,
          minWidth: 0,
          height: 50,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingLeft: Spacing.md,
          paddingRight: Spacing.sm,
          backgroundColor: Colors.card,
          borderRadius: Radii.pill,
          ...Shadows.card,
        },
        title: {
          ...Typography.caption,
          color: Colors.secondaryText,
        },
        station: {
          ...Typography.bodyBold,
          color: Colors.text,
        },
        jumpCircle: {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: Colors.blue,
        },
      }),
    [Colors, Radii, Shadows],
  )
  return (
    <TouchableOpacity
      style={bannerStyles.banner}
      onPress={onJump}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`On shift at ${station}. Tap to jump to station.`}
    >
      <MaterialIcons name="badge" size={22} color={Colors.blue} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={bannerStyles.title}>On shift at</Text>
        <Text style={bannerStyles.station} numberOfLines={1}>
          {station}
        </Text>
      </View>
      <View style={bannerStyles.jumpCircle}>
        <MaterialIcons name="arrow-upward" size={20} color={Colors.card} />
      </View>
    </TouchableOpacity>
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
          alignItems: 'center',
          gap: Spacing.sm,
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

  // Geometry for the route currently being previewed or travelled, drawn on the map behind the
  // sheets. The live active journey wins over a detail preview so the in-progress trip is shown;
  // null when neither is open, which unmounts the overlay.
  const mapRoute = useMemo(() => {
    const journey = activeJourneyParams?.journey ?? activeDetail?.journey ?? null
    if (!journey) return null
    return journeyToRouteGeometry(journey, { fallback: Colors.blue, walk: Colors.secondaryText })
  }, [activeJourneyParams, activeDetail, Colors.blue, Colors.secondaryText])

  const { status, user } = useAuth()
  const coords = useAppLocation()

  // Camera behaviour for the route overlay. We frame the whole trip only when the journey *becomes*
  // active (start or resume), not while it's merely being previewed: the detail sheet is a single
  // near-fullscreen snap, so fitting the route while it's open would cram the trip into the thin
  // strip of map left above it and zoom right out to all of London. Reacting only to the journey
  // becoming active (not every GPS tick) also means manual panning mid-journey isn't fought.
  const wasActiveRef = useRef(false)
  // The journey object last framed by the camera, so a mid-journey reroute (which swaps the journey
  // while it's already active) re-frames to the new route rather than being treated as a GPS tick.
  const fittedJourneyRef = useRef<Journey | null>(null)
  // Bounds awaiting a camera fit. The actual fit runs once the sheet height (and thus the map's
  // bottom padding) settles — see the mapBottomInset effect below — so the route is framed into the
  // band the sheet really leaves visible, not a stale, taller inset.
  const pendingFitRef = useRef<LatLng[] | null>(null)
  useEffect(() => {
    if (!mapRoute) {
      wasActiveRef.current = false
      fittedJourneyRef.current = null
      pendingFitRef.current = null
      return
    }
    const journey = activeJourneyParams?.journey ?? null
    const justStarted = Boolean(activeJourneyParams) && !wasActiveRef.current
    const rerouted =
      Boolean(activeJourneyParams) && !justStarted && journey !== fittedJourneyRef.current
    wasActiveRef.current = Boolean(activeJourneyParams)
    // On start the detail sheet we're leaving is still closing, and on a reroute the active sheet is
    // collapsing from a taller snap (or shedding the alert banner); either way its reported height —
    // which drives the map's bottom padding — is mid-flight. Fitting now would frame the route into
    // the thin strip above that stale inset and zoom out too far. Queue the bounds and let the
    // inset-settle effect fit once the height lands; the timer is a fallback for when it never moves.
    if (justStarted || rerouted) {
      fittedJourneyRef.current = journey
      pendingFitRef.current = mapRoute.bounds
      const id = setTimeout(() => {
        if (!pendingFitRef.current) return
        mapRef.current?.fitToRoute(pendingFitRef.current)
        pendingFitRef.current = null
      }, 500)
      return () => clearTimeout(id)
    }
  }, [mapRoute, activeJourneyParams])

  // Fit the route when the detail sheet opens. Uses a dedicated timeout rather than pendingFitRef
  // because mapBottomInset drops to 0 the moment the search sheet dismisses (before the detail
  // sheet has opened), which would cause pendingFitRef to fire against a zero inset and frame the
  // route into the full screen — then the sheet opens and covers the bottom of it. Waiting ~450ms
  // lets the sheet settle at its minimum snap so mapPadding is correct when the fit runs.
  useEffect(() => {
    if (!activeDetail || !mapRoute) return
    const id = setTimeout(() => mapRef.current?.fitToRoute(mapRoute.bounds), 450)
    return () => clearTimeout(id)
  }, [activeDetail]) // eslint-disable-line react-hooks/exhaustive-deps
  const { workStation } = useWorkShift()
  const { stations } = useStations()
  const isTrusted = user?.role === 'trusted'
  // Staff's on-shift station, when set, anchors the map and powers one-tap reporting.
  const shiftStation = isTrusted && workStation ? workStation : null
  const shiftAnchor = useMemo(() => {
    if (!shiftStation) return null
    const station = stations.find((s) => s.name === shiftStation)
    if (station?.latitude == null || station?.longitude == null) return null
    return { latitude: station.latitude, longitude: station.longitude }
  }, [shiftStation, stations])
  // Each sheet reports its current snap height; the map uses the tallest one as its bottom inset.
  const [searchHeight, setSearchHeight] = useState(Dimensions.get('window').height * 0.5)
  const [stationHeight, setStationHeight] = useState(0)
  const [reportHeight, setReportHeight] = useState(0)
  const [plannerHeight, setPlannerHeight] = useState(0)
  const [detailHeight, setDetailHeight] = useState(0)
  const [activeJourneyHeight, setActiveJourneyHeight] = useState(0)
  // Any flow other than search (a station, plan, journey detail/active, or report) dismisses the
  // search sheet and takes over the screen. While one is open the search sheet's last height must
  // be excluded from the inset — otherwise its ~50% height keeps inflating mapPadding even though
  // it's gone, which (a) jumps the camera twice on Android and (b) makes the route fit on journey
  // start frame into the wrong band and zoom right out instead of framing the trip.
  const overlayActive = Boolean(
    activeStation || activePlan || activeDetail || activeJourneyParams || activeReport,
  )
  // Once a journey is active, only the sheets that can sit over it count — the active-journey sheet
  // itself, or a station/report opened on top. The planner and detail sheets are torn down on start
  // but keep reporting their tall height for a frame or two while their close animation runs; if we
  // let that linger in the inset, the route fit on start frames into the thin strip left above the
  // stale height and zooms the trip down to a dot. Excluding them lets the inset settle straight to
  // the compact active-journey height so the fit frames the whole trip.
  const mapBottomInset = activeJourneyParams
    ? Math.max(activeJourneyHeight, stationHeight, reportHeight)
    : overlayActive
      ? Math.max(stationHeight, reportHeight, plannerHeight, detailHeight)
      : searchHeight

  // Run a queued route fit (from start / reroute) once the bottom inset settles, so the camera
  // frames the route against the sheet's final height rather than a transient taller one. The fit
  // uses `mapPadding` (driven by mapBottomInset), so reacting to its change guarantees correct
  // framing; the fallback timer in the queueing effect covers the case where the inset never moves.
  useEffect(() => {
    if (!pendingFitRef.current) return
    const bounds = pendingFitRef.current
    pendingFitRef.current = null
    const id = requestAnimationFrame(() => mapRef.current?.fitToRoute(bounds))
    return () => cancelAnimationFrame(id)
  }, [mapBottomInset])
  // The sheets that expand to full height all snap to `SCREEN_H - insets.top - 66`, leaving just
  // enough room for the top buttons. When a sheet reaches that height it covers the map entirely
  // (e.g. the route overview), so the re-centre/account buttons are hidden to avoid floating over it.
  const insets = useSafeAreaInsets()
  const sheetIsFullscreen = mapBottomInset >= Dimensions.get('window').height - insets.top - 10

  const topButtonsOpacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.timing(topButtonsOpacity, {
      toValue: sheetIsFullscreen ? 0 : 1,
      duration: 180,
      useNativeDriver: true,
    }).start()
  }, [sheetIsFullscreen, topButtonsOpacity])

  // The search sheet is the resting state of the map. Any other flow (a station, a plan, a journey
  // detail/active journey, or a report) takes over the screen, so the search sheet is dismissed
  // while one is open and restored only once they all close. Driving this declaratively from state
  // avoids the imperative dismiss()/restore() calls racing with sheet close animations.
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
    setStationHeight(Dimensions.get('window').height * 0.52)
    setActiveStation(stationName)
    sheetRef.current?.dismiss()
    mapRef.current?.focusStation(stationName)
  }

  // One-tap access for staff: skip the search step and pull up the station sheet for the
  // station they declared they're working at.
  function jumpToShiftStation() {
    if (!shiftStation) return
    openStation(shiftStation)
  }

  function closeStation() {
    setActiveStation(null)
    setStationPausedForJourney(false)
    setStationHeight(0)
    mapRef.current?.clearFocus()
    if (coords) mapRef.current?.recentre()
    // When the station was opened over an active journey, the search sheet is dismissed and the
    // journey sheet is underneath — don't resurrect the search sheet, just reveal the journey.
    if (!activeJourneyParams) sheetRef.current?.restore()
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
      <StationMap
        ref={mapRef}
        onStationPress={openStation}
        bottomInset={mapBottomInset}
        anchor={shiftAnchor}
        route={mapRoute}
      />

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
        onRerouteSelected={(journey) =>
          setActiveJourneyParams((prev) => (prev ? { ...prev, journey } : prev))
        }
        onHeightChange={setActiveJourneyHeight}
      />

      <JourneyPlannerSheet
        plan={activePlan}
        hidden={Boolean(activeDetail)}
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
          // the route once the active journey is the only open flow. Clearing the map focus too
          // removes the station roundel pin, which otherwise lingers on the map after the journey.
          setActiveStation(null)
          setStationPausedForJourney(false)
          mapRef.current?.clearFocus()
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
        <Animated.View
          style={[styles.topButtons, { opacity: topButtonsOpacity }]}
          pointerEvents={sheetIsFullscreen ? 'none' : 'box-none'}
        >
          <TopIconButton
            icon="my-location"
            size={50}
            color={coords ? Colors.blue : Colors.secondaryText}
            accessibilityLabel="Re-centre map on my location"
            onPress={() => mapRef.current?.recentre()}
          />
          {shiftStation && !activeStation && !activeReport && (
            <ShiftBanner station={shiftStation} onJump={jumpToShiftStation} />
          )}
          <TopIconButton
            icon={status === 'authed' ? 'account-circle' : 'person'}
            color={status === 'authed' ? Colors.blue : Colors.text}
            size={50}
            accessibilityLabel={
              status === 'authed' && user ? `Logged in as ${user.username}` : 'Log in'
            }
            onPress={handleAccountPress}
          />
        </Animated.View>
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
