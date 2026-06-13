import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Spinner, Text, XStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { SheetHeader } from '@/components/SheetHeader'
import {
  fetchStationOutages,
  matchOutages,
  type StationOutage,
} from '@/features/journey/api/accessibility'
import { assessOutages } from '@/features/journey/api/outageRelevance'
import { useStations } from '@/features/stations'
import { type ResolvedLocation, resolveToPostcode, tflQuery } from '@/features/journey/api/geocode'
import { type PlaceShortcut } from '@/features/journey/components/LocationInput'
import type { SavedPlaces } from '@/features/journey/api/savedPlaces'
import { useAppLocation } from '@/lib/LocationContext'
import { alertOffline, isOfflineError } from '@/lib/offline'
import { useAccessibilityPreference } from '@/lib/AccessibilityPreferenceContext'
import { useWorkShift } from '@/lib/WorkShiftContext'
import { useAuth } from '@/features/auth'
import {
  type AccessibilityPreference,
  type Journey,
  type JourneyOptionsResult,
  planJourneyOptions,
  type RouteTag,
  type TimeConstraint,
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
  onHeightChange?: (height: number) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEP_FREE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'No preference', value: null },
  { label: 'To platform', value: 'StepFreeToPlatform' },
  { label: 'To train (fully step-free)', value: 'StepFreeToVehicle' },
]

// ---------------------------------------------------------------------------
// Journey options cache
// ---------------------------------------------------------------------------

type CachedOptions = { journey: Journey; tags: RouteTag[] }[]
const journeyOptionsCache = new Map<string, CachedOptions>()

const CACHE_BUCKET_MS = 5 * 60 * 1000 // 5-minute staleness window for "leave now"

function optionsCacheKey(
  from: string,
  to: string,
  level: AccessibilityPreference | null,
  time: TimeConstraint | null,
): string {
  const timePart = time ?? Math.floor(Date.now() / CACHE_BUCKET_MS)
  // `from`/`to` are the actual TfL query strings (postcode or station id), so a station-id plan
  // and a postcode plan for the same place never collide.
  return JSON.stringify([from, to, level, timePart])
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SWAP_BTN = 36 // diameter of the floating swap button
const FROM_TO_GAP = 10 // vertical gap between From and To inputs

export function JourneyPlannerSheet({
  plan,
  onClose,
  onJourneySelect,
  savedPlaces,
  onHeightChange,
}: Props) {
  const { Colors, Radii } = useTheme()
  const { defaultLevel } = useAccessibilityPreference()
  const { stations } = useStations()
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
  // Station NaPTAN ids when the endpoint is a known station — preferred over the postcode as the
  // TfL query so the journey ends at the station (no trailing walk). Cleared whenever the user
  // types into the field (the postcode is cleared there too, so a stale id can't survive).
  const [fromTflId, setFromTflId] = useState<string | undefined>(undefined)
  const [toTflId, setToTflId] = useState<string | undefined>(undefined)
  const [fromIsCurrentLocation, setFromIsCurrentLocation] = useState(false)
  const [toIsNamedPlace, setToIsNamedPlace] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [level, setLevel] = useState<AccessibilityPreference | null>(defaultLevel)
  const [timeConstraint, setTimeConstraint] = useState<TimeConstraint | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<JourneyResult[]>([])
  const [resolved, setResolved] = useState<Resolved | null>(null)
  // True after the close button is tapped so handleChange(-1) doesn't fire onClose() again.
  const closedByButton = useRef(false)
  // True once a successful search has been performed; resets when the planner re-opens.
  const hasSearched = useRef(false)
  // Guards the prevHadBoth auto-search: reset on every plan open so re-opening with the same
  // postcodes (unchanged state) still fires the auto-search.
  const prevHadBoth = useRef(false)
  // Incremented each time the planner opens. Included in the auto-search effect's deps so
  // the effect fires even when postcodes are identical to the previous session (e.g. the user
  // taps the same recent location twice — React bails on the setState, so [fromPostcode,
  // toPostcode] alone wouldn't re-run).
  const [autoSearchTrigger, setAutoSearchTrigger] = useState(0)

  const cachedCoords = useAppLocation()
  const { workStation } = useWorkShift()
  const { user } = useAuth()
  // For staff on shift, "current location" resolves to their station (GPS is unreliable
  // underground). Null when not on shift, falling back to the device location.
  const shiftDetail =
    user?.role === 'trusted' && workStation
      ? stations.find((s) => s.name === workStation)
      : undefined
  const hasShiftCoords = shiftDetail?.latitude != null && shiftDetail?.longitude != null
  // Measured height of the From input container — used to vertically position the swap button.
  const [fromH, setFromH] = useState(70)

  // Search is only allowed once both fields are resolved to a postcode — i.e. both show
  // a tick. Typing into a field clears its postcode (LocationInput.handleType), so a
  // partially-typed address can never satisfy this.
  const canSearch = fromPostcode !== null && toPostcode !== null

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

  const handleCurrentLocation = useCallback(async () => {
    const coord =
      hasShiftCoords && shiftDetail
        ? `${shiftDetail.latitude},${shiftDetail.longitude}`
        : cachedCoords
          ? `${cachedCoords.latitude},${cachedCoords.longitude}`
          : null
    if (!coord) return
    setGettingLocation(true)
    try {
      const result = await resolveToPostcode(coord)
      if ('error' in result) return
      setFrom(shiftDetail ? `On shift: ${shiftDetail.name}` : 'Current location')
      setFromPostcode(result.postcode)
      setFromIsCurrentLocation(true)
    } catch (err) {
      if (isOfflineError(err)) alertOffline('use your current location')
    } finally {
      setGettingLocation(false)
    }
  }, [cachedCoords, hasShiftCoords, shiftDetail])

  // ── Open/close driven by plan prop ────────────────────────────────────

  useEffect(() => {
    if (plan) {
      closedByButton.current = false
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFrom(plan.initialFrom?.label ?? '')
      setTo(plan.initialTo?.label ?? '')
      setFromPostcode(plan.initialFrom?.postcode ?? null)
      setToPostcode(plan.initialTo?.postcode ?? null)
      setFromTflId(plan.initialFrom?.tflId)
      setToTflId(plan.initialTo?.tflId)
      setFromIsCurrentLocation(plan.initialFrom?.label === 'Current location')
      setToIsNamedPlace(Boolean(plan.initialTo?.isNamedPlace))
      setLevel(defaultLevel)
      setTimeConstraint(null)
      setResults([])
      setResolved(null)
      setGettingLocation(false)
      setLoading(false)
      hasSearched.current = false
      prevHadBoth.current = false
      setAutoSearchTrigger((t) => t + 1)
      sheetRef.current?.snapToIndex(1)
      if (!plan.initialFrom && (hasShiftCoords || cachedCoords)) handleCurrentLocation()
    } else if (!closedByButton.current) {
      // Programmatic close (parent cleared plan) — animate the sheet away.
      // If closedByButton is true, close() was already called from the button handler.
      sheetRef.current?.close()
    }
  }, [plan]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (results.length > 0) sheetRef.current?.snapToIndex(2)
  }, [results])

  // Auto-search the moment both postcodes become resolved — covers opening from a saved place
  // (where current location fills in async) and the general case of resolving the second field.
  useEffect(() => {
    const hasBoth = fromPostcode !== null && toPostcode !== null
    if (hasBoth && !prevHadBoth.current && !loading) run()
    prevHadBoth.current = hasBoth
  }, [fromPostcode, toPostcode, autoSearchTrigger]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-run automatically when the step-free preference or time constraint changes, but only
  // after an initial search has already been performed (so the first open doesn't double-fire).
  useEffect(() => {
    if (!hasSearched.current || !canSearch || loading) return
    run()
  }, [level, timeConstraint]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleChange(index: number) {
    onHeightChange?.(index >= 0 ? snapPoints[index] : 0)
    if (index === -1) {
      journeyOptionsCache.clear()
      if (!closedByButton.current) onClose()
      closedByButton.current = false
    }
  }

  // ── Swap From ↔ To ────────────────────────────────────────────────────

  function swapLocations() {
    const tempText = from
    const tempPostcode = fromPostcode
    const tempTflId = fromTflId
    setFrom(to)
    setFromPostcode(toPostcode)
    setFromTflId(toTflId)
    setFromIsCurrentLocation(false)
    setTo(tempText)
    setToPostcode(tempPostcode)
    setToTflId(tempTflId)
    setToIsNamedPlace(false)
  }

  // ── Journey planning ──────────────────────────────────────────────────

  async function run() {
    // Guarded by the disabled Search button, but re-check here as a safety net: both
    // fields must be resolved to a postcode before we can plan.
    if (!canSearch) {
      Alert.alert('Required', 'Please choose a valid start and destination.')
      return
    }
    setLoading(true)
    setResults([])
    setResolved(null)

    const fromLoc: ResolvedLocation = { postcode: fromPostcode!, label: from, tflId: fromTflId }
    const toLoc: ResolvedLocation = {
      postcode: toPostcode!,
      label: to,
      isNamedPlace: toIsNamedPlace || undefined,
      tflId: toTflId,
    }

    try {
      const outagesPromise = fetchStationOutages()
      setResolved({ from: fromLoc, to: toLoc })

      const [fromQuery, toQuery] = await Promise.all([tflQuery(fromLoc), tflQuery(toLoc)])
      const cacheKey = optionsCacheKey(fromQuery, toQuery, level, timeConstraint)
      const cached = journeyOptionsCache.get(cacheKey)

      let journeyOptions: CachedOptions
      if (cached) {
        journeyOptions = cached
      } else {
        const optResult: JourneyOptionsResult = await planJourneyOptions(
          fromQuery,
          toQuery,
          level,
          timeConstraint,
        )
        if (optResult.kind !== 'journeys') {
          setLoading(false)
          // Reset so the next manual search or preference change doesn't silently fire.
          hasSearched.current = false
          Alert.alert('No journey', optResult.message)
          return
        }
        journeyOptions = optResult.journeys
        journeyOptionsCache.set(cacheKey, journeyOptions)
      }

      const outages = await outagesPromise
      const flagged = journeyOptions.map(({ journey, tags }) => {
        const matched = matchOutages(journey, outages)
        const assessments = assessOutages(journey, matched, stations)
        const enriched = matched.map((outage) => {
          // assessOutages skips stations with unknown role so length may be < matched;
          // look up by station name rather than assuming a 1-to-1 index correspondence.
          const assessment = assessments.find((a) => a.stationName === outage.stationName)
          return {
            ...outage,
            journeyRelevantLifts: assessment?.journeyRelevantLifts ?? { broken: 0, total: 0 },
          }
        })
        return { journey, tags, outages: enriched }
      })
      flagged.sort((a, b) => Number(a.outages.length > 0) - Number(b.outages.length > 0))
      setResults(flagged)
      hasSearched.current = true
    } catch {
      // Unexpected error — reset so the UI isn't permanently stuck in loading state.
    } finally {
      setLoading(false)
    }
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
          journeyOptionsCache.clear()
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
          <View
            onLayout={(e) => setFromH(e.nativeEvent.layout.height)}
            style={{ zIndex: 10, position: 'relative' }}
          >
            <LocationInput
              label="From"
              value={from}
              onChangeText={(text) => {
                setFrom(text)
                setFromIsCurrentLocation(false)
                setFromTflId(undefined)
              }}
              onResolved={setFromPostcode}
              onSelect={(label, postcode, tflId) => {
                setFrom(label)
                setFromPostcode(postcode)
                setFromTflId(tflId)
                setFromIsCurrentLocation(false)
              }}
              isResolved={fromPostcode !== null}
              textColor={fromIsCurrentLocation ? Colors.blue : undefined}
              textBold={fromIsCurrentLocation}
              onCurrentLocation={hasShiftCoords || cachedCoords ? handleCurrentLocation : undefined}
              currentLocationLoading={gettingLocation}
              savedPlaceShortcuts={placeShortcuts}
              stations={stations}
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
              setToTflId(undefined)
            }}
            onResolved={setToPostcode}
            onSelect={(label, postcode, tflId) => {
              setTo(label)
              setToPostcode(postcode)
              setToTflId(tflId)
              setToIsNamedPlace(false)
            }}
            isResolved={toPostcode !== null}
            textColor={toIsNamedPlace ? Colors.blue : undefined}
            textBold={toIsNamedPlace}
            savedPlaceShortcuts={placeShortcuts}
            stations={stations}
          />

          {/* Swap button — centred between the From input's bottom and the To input's top.
              The To container starts at fromH + FROM_TO_GAP, with ~26 px of label+gap before
              the actual input, so the visual midpoint is ~fromH + 18 → top = fromH + 18 - 18. */}
          <TouchableOpacity
            onPress={swapLocations}
            style={[styles.swapBtn, { top: fromH }]}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Swap start and destination"
          >
            <MaterialIcons name="swap-vert" size={18} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Filter row */}
        <XStack gap="$2" mt="$2">
          <LeavePill value={timeConstraint} onChange={setTimeConstraint} />
          <FilterPill
            label="Step-free"
            options={STEP_FREE_OPTIONS}
            value={level}
            onSelect={(v) => setLevel(v as AccessibilityPreference | null)}
          />
        </XStack>

        {/* Search button */}
        <TouchableOpacity
          onPress={loading || !canSearch ? undefined : run}
          activeOpacity={loading || !canSearch ? 1 : 0.75}
          style={[styles.searchBtn, { opacity: loading || !canSearch ? Opacity.disabledMid : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Search for journeys"
          accessibilityState={{ disabled: loading || !canSearch }}
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
