import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { SheetHeader } from '@/components/SheetHeader'
import {
  fetchStationOutages,
  matchOutages,
  type StationOutage,
} from '@/features/journey/api/accessibility'
import { type ResolvedLocation, resolveToPostcode } from '@/features/journey/api/geocode'
import { type PlaceShortcut } from '@/features/journey/components/LocationInput'
import type { SavedPlaces } from '@/features/journey/api/savedPlaces'
import { useAppLocation } from '@/lib/LocationContext'
import {
  type AccessibilityPreference,
  type Journey,
  type JourneyOptionsResult,
  type JourneyPreference,
  planJourney,
  planJourneyOptions,
  type RouteTag,
  type TaggedJourney,
} from '@/features/journey/api/tfl'
import { JourneyResultCard } from '@/features/journey/components/JourneyResultCard'
import { FilterPill, LeavePill } from '@/features/journey/components/FilterPill'
import { LocationInput } from '@/features/journey/components/LocationInput'
import type { JourneyDetailParams } from '@/features/home/components/JourneyDetailSheet'
import { useTheme, Borders, Opacity, Spacing } from '@/theme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JourneyResult = { journey: Journey; outages: StationOutage[]; tags: RouteTag[] }
type Resolved = { from: ResolvedLocation; to: ResolvedLocation }

export type JourneyPlan = {
  initialFrom?: ResolvedLocation
  initialTo?: ResolvedLocation
}

type Props = {
  plan: JourneyPlan | null
  onClose: () => void
  onJourneySelect: (params: JourneyDetailParams) => void
  savedPlaces?: SavedPlaces
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_FREE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'No preference', value: null },
  { label: 'To platform', value: 'StepFreeToPlatform' },
  { label: 'To train (fully step-free)', value: 'StepFreeToVehicle' },
]

const PREFERENCE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'No preference', value: null },
  { label: 'Fastest', value: 'LeastTime' },
  { label: 'Fewest changes', value: 'LeastInterchange' },
  { label: 'Least walking', value: 'LeastWalking' },
]

const PREF_TAG: Record<JourneyPreference, RouteTag> = {
  LeastTime: 'fastest',
  LeastInterchange: 'fewest-changes',
  LeastWalking: 'least-walking',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SWAP_BTN = 36 // diameter of the floating swap button
const FROM_TO_GAP = 10 // vertical gap between From and To inputs

export function JourneyPlannerSheet({ plan, onClose, onJourneySelect, savedPlaces }: Props) {
  const { Colors, Radii } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        content: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
        },
        // Floating swap button hovering between From and To on the right side.
        swapBtn: {
          width: SWAP_BTN,
          height: SWAP_BTN,
          borderRadius: SWAP_BTN / 2,
          borderWidth: Borders.thin,
          borderColor: Colors.border,
          backgroundColor: Colors.card,
          alignItems: 'center',
          justifyContent: 'center',
          position: 'absolute',
          right: 0,
          zIndex: 15,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 4,
        },
        searchBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: 42,
          borderRadius: Radii.button,
          backgroundColor: Colors.text,
          marginTop: Spacing.sm,
        },
      }),
    [Colors, Radii],
  )

  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetRef>(null)

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [fromPostcode, setFromPostcode] = useState<string | null>(null)
  const [toPostcode, setToPostcode] = useState<string | null>(null)
  const [fromIsCurrentLocation, setFromIsCurrentLocation] = useState(false)
  const [toIsNamedPlace, setToIsNamedPlace] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [level, setLevel] = useState<AccessibilityPreference | null>(null)
  const [preference, setPreference] = useState<JourneyPreference | null>(null)
  const [departAt, setDepartAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<JourneyResult[]>([])
  const [resolved, setResolved] = useState<Resolved | null>(null)
  // True after the close button is tapped so handleChange(-1) doesn't fire onClose() again.
  const closedByButton = useRef(false)

  const cachedCoords = useAppLocation()
  // Measured height of the From input container — used to vertically position the swap button.
  const [fromH, setFromH] = useState(70)

  const placeShortcuts = useMemo<PlaceShortcut[]>(() => {
    if (!savedPlaces) return []
    const shortcuts: PlaceShortcut[] = []
    if (savedPlaces.home)
      shortcuts.push({ label: 'Home', icon: 'home', postcode: savedPlaces.home.postcode })
    if (savedPlaces.work)
      shortcuts.push({ label: 'Work', icon: 'work', postcode: savedPlaces.work.postcode })
    savedPlaces.custom.forEach((p) =>
      shortcuts.push({ label: p.name, icon: p.icon, postcode: p.postcode }),
    )
    return shortcuts
  }, [savedPlaces])

  // ── Current-location helper ────────────────────────────────────────────

  const handleCurrentLocation = useCallback(
    async (silent = false) => {
      setGettingLocation(true)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          if (!silent) Alert.alert('Location required', 'Enable location access in Settings.')
          return
        }
        const pos =
          cachedCoords ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords
        const result = await resolveToPostcode(`${pos.latitude},${pos.longitude}`)
        if ('error' in result) {
          if (!silent) Alert.alert('Location error', result.error)
          return
        }
        setFrom('Current location')
        setFromPostcode(result.postcode)
        setFromIsCurrentLocation(true)
      } finally {
        setGettingLocation(false)
      }
    },
    [cachedCoords],
  )

  // ── Open/close driven by plan prop ────────────────────────────────────

  useEffect(() => {
    if (plan) {
      closedByButton.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFrom(plan.initialFrom?.label ?? '')
      setTo(plan.initialTo?.label ?? '')
      setFromPostcode(plan.initialFrom?.postcode ?? null)
      setToPostcode(plan.initialTo?.postcode ?? null)
      setFromIsCurrentLocation(plan.initialFrom?.label === 'Current location')
      setToIsNamedPlace(Boolean(plan.initialTo?.isNamedPlace))
      setLevel(null)
      setPreference(null)
      setDepartAt(null)
      setResults([])
      setResolved(null)
      setGettingLocation(false)
      setLoading(false)
      sheetRef.current?.snapToIndex(1)
      if (!plan.initialFrom) {
        handleCurrentLocation(true)
      }
    } else if (!closedByButton.current) {
      // Programmatic close (parent cleared plan) — animate the sheet away.
      // If closedByButton is true, close() was already called from the button handler.
      sheetRef.current?.close()
    }
  }, [plan]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (results.length > 0) sheetRef.current?.snapToIndex(2)
  }, [results])

  function handleChange(index: number) {
    if (index === -1) {
      if (!closedByButton.current) onClose()
      closedByButton.current = false
    }
  }

  // ── Swap From ↔ To ────────────────────────────────────────────────────

  function swapLocations() {
    const tempText = from
    const tempPostcode = fromPostcode
    setFrom(to)
    setFromPostcode(toPostcode)
    setFromIsCurrentLocation(false)
    setTo(tempText)
    setToPostcode(tempPostcode)
    setToIsNamedPlace(false)
  }

  // ── Journey planning ──────────────────────────────────────────────────

  async function run() {
    if (!from.trim() || !to.trim()) {
      Alert.alert('Required', 'Please enter both a start and a destination.')
      return
    }
    setLoading(true)
    setResults([])
    setResolved(null)

    const resolveField = (text: string, postcode: string | null, isNamedPlace?: boolean) =>
      postcode
        ? Promise.resolve({ postcode, label: text, isNamedPlace } as ResolvedLocation)
        : resolveToPostcode(text)

    const outagesPromise = fetchStationOutages()
    const [fromLoc, toLoc] = await Promise.all([
      resolveField(from, fromPostcode),
      resolveField(to, toPostcode, toIsNamedPlace || undefined),
    ])

    if ('error' in fromLoc) {
      setLoading(false)
      Alert.alert('Start location', fromLoc.error)
      return
    }
    if ('error' in toLoc) {
      setLoading(false)
      Alert.alert('Destination', toLoc.error)
      return
    }
    setResolved({ from: fromLoc, to: toLoc })

    let optResult: JourneyOptionsResult
    if (preference) {
      const single = await planJourney(
        fromLoc.postcode,
        toLoc.postcode,
        level,
        departAt,
        preference,
      )
      if (single.kind !== 'journeys') {
        setLoading(false)
        Alert.alert('No journey', single.message)
        return
      }
      const tag = PREF_TAG[preference]
      optResult = {
        kind: 'journeys',
        journeys: single.journeys.map((journey): TaggedJourney => ({ journey, tags: [tag] })),
      }
    } else {
      optResult = await planJourneyOptions(fromLoc.postcode, toLoc.postcode, level, departAt)
    }

    if (optResult.kind !== 'journeys') {
      setLoading(false)
      Alert.alert('No journey', optResult.message)
      return
    }

    const outages = await outagesPromise
    const flagged = optResult.journeys.map(({ journey, tags }) => ({
      journey,
      tags,
      outages: matchOutages(journey, outages),
    }))
    flagged.sort((a, b) => Number(a.outages.length > 0) - Number(b.outages.length > 0))
    setResults(flagged)
    setLoading(false)
  }

  // ── Render ────────────────────────────────────────────────────────────

  // Three snaps: collapsed (title bar only), form, full results.
  // No enablePanDownToClose — swiping down collapses to the title bar instead of closing.
  const COLLAPSED_H = 76
  const snapPoints = useMemo(() => {
    const h = Dimensions.get('window').height
    return [COLLAPSED_H, h * 0.75, h - insets.top - 66]
  }, [insets.top])

  return (
    <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} onChange={handleChange}>
      {/* Outside the scroll view so it never gets double-padded */}
      <SheetHeader
        title="Plan a journey"
        onClose={() => {
          closedByButton.current = true
          onClose()
          sheetRef.current?.close()
        }}
      />

      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
      >
        {/* Citymapper-style: inputs fill full width, swap button floats between them on the right */}
        <View style={{ position: 'relative', zIndex: 20 }}>
          <View onLayout={(e) => setFromH(e.nativeEvent.layout.height)} style={{ zIndex: 10, position: 'relative' }}>
            <LocationInput
              label="From"
              value={from}
              onChangeText={(text) => {
                setFrom(text)
                setFromIsCurrentLocation(false)
              }}
              onResolved={setFromPostcode}
              isResolved={fromPostcode !== null}
              textColor={fromIsCurrentLocation ? Colors.blue : undefined}
              textBold={fromIsCurrentLocation}
              onCurrentLocation={handleCurrentLocation}
              currentLocationLoading={gettingLocation}
              savedPlaceShortcuts={placeShortcuts}
            />
          </View>

          {/* Gap row */}
          <View style={{ height: FROM_TO_GAP }} />

          <LocationInput
            label="To"
            value={to}
            onChangeText={(text) => {
              setTo(text)
              setToIsNamedPlace(false)
            }}
            onResolved={setToPostcode}
            isResolved={toPostcode !== null}
            textColor={toIsNamedPlace ? Colors.blue : undefined}
            textBold={toIsNamedPlace}
            savedPlaceShortcuts={placeShortcuts}
          />

          {/* Swap button — centered on the From/To boundary, pinned to the right */}
          <TouchableOpacity
            onPress={swapLocations}
            style={[styles.swapBtn, { top: fromH + FROM_TO_GAP / 2 - SWAP_BTN / 2 }]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Swap start and destination"
          >
            <MaterialIcons name="swap-vert" size={18} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Filter row */}
        <XStack gap="$2" mt="$2">
          <LeavePill value={departAt} onChange={setDepartAt} />
          <FilterPill
            label="Step-free"
            options={STEP_FREE_OPTIONS}
            value={level}
            onSelect={(v) => setLevel(v as AccessibilityPreference | null)}
          />
          <FilterPill
            label="Preference"
            options={PREFERENCE_OPTIONS}
            value={preference}
            onSelect={(v) => setPreference(v as JourneyPreference | null)}
          />
        </XStack>

        {/* Search button */}
        <TouchableOpacity
          onPress={loading ? undefined : run}
          activeOpacity={loading ? 1 : 0.75}
          style={[styles.searchBtn, { opacity: loading ? Opacity.disabledMid : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Search for journeys"
        >
          {loading ? (
            <Spinner size="small" color={Colors.card} />
          ) : (
            <MaterialIcons name="search" size={18} color={Colors.card} />
          )}
          <Text color={Colors.card} fontSize={15} fontWeight="700">
            {loading ? 'Searching…' : 'Search'}
          </Text>
        </TouchableOpacity>

        {/* Results */}
        {results.map(({ journey, outages, tags }, i) => (
          <JourneyResultCard
            key={i}
            journey={journey}
            outages={outages}
            tags={tags}
            onPress={() =>
              onJourneySelect({
                journey,
                from: resolved?.from,
                to: resolved?.to,
                outages,
                level,
                tags,
              })
            }
          />
        ))}
      </BottomSheetScrollView>
    </BottomSheet>
  )
}
