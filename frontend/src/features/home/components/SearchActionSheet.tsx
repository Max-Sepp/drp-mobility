// Bottom sheet that lives inside MapHomeScreen.
// Three snap points:
//   index 0 – PILL   (~100 px) : only the search pill visible; map in focus
//   index 1 – HOME   (~320 px) : Places row + Saved Journeys (default / launch state)
//   index 2 – OPEN   (82 % of screen) : search active; results fill the sheet
//
// Gestures, keyboard avoidance, and scroll-vs-drag conflicts are all handled by
// @gorhom/bottom-sheet — no PanResponder or Animated wiring needed here.

import { MaterialIcons } from '@expo/vector-icons'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { NativeViewGestureHandler } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CustomPlace, SavedPlaces } from '@/features/journey/api/savedPlaces'
import {
  addRecentLocation,
  getRecentLocations,
  type RecentLocation,
} from '@/features/journey/api/recentLocations'
import { clockTime } from '@/features/journey/components/legDisplay'
import type { SavedJourney } from '@/features/journey/api/savedJourneys'
import {
  searchLocations,
  postcodeForSuggestion,
  resolveToPostcode,
  type LocationSuggestion,
  type ResolvedLocation,
} from '@/features/journey/api/geocode'
import { useStations, type StationDetail } from '@/features/stations/useStations'
import { fuzzyScore } from '@/lib/fuzzy'
import { useAppLocation } from '@/lib/LocationContext'
import { alertOffline, isOfflineError } from '@/lib/offline'
import { useWorkShift } from '@/lib/WorkShiftContext'
import { useAuth } from '@/features/auth'
import { useTheme, Spacing, Typography } from '@/theme'
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetFlatList,
  type BottomSheetRef,
} from '@/components/BottomSheet'

// ---------------------------------------------------------------------------
// Snap indices
// ---------------------------------------------------------------------------

const SCREEN_H = Dimensions.get('window').height

// Heights of the visible sheet at each snap point (gorhom convention: height from bottom).
const SNAP_POINTS = [100, 320, SCREEN_H * 0.82]

const SNAP_IDX_HOME = 1
const SNAP_IDX_OPEN = 2

// ---------------------------------------------------------------------------
// Public handle
// ---------------------------------------------------------------------------

export type SearchActionSheetHandle = {
  expand: () => void // snap to OPEN (search active)
  dismiss: () => void // snap to PILL (map focus)
  restore: () => void // snap to HOME (normal state)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const NAMED_PLACES: { key: 'home' | 'work'; icon: 'home' | 'work'; label: string }[] = [
  { key: 'home', icon: 'home', label: 'Home' },
  { key: 'work', icon: 'work', label: 'Work' },
]

function PlacesRow({
  savedPlaces,
  onPress,
  onLongPress,
  onCustomPlacePress,
  onCustomPlaceLongPress,
  onAddPress,
}: {
  savedPlaces: SavedPlaces
  onPress: (key: 'home' | 'work') => void
  onLongPress: (key: 'home' | 'work') => void
  onCustomPlacePress: (place: CustomPlace) => void
  onCustomPlaceLongPress: (place: CustomPlace) => void
  onAddPress: () => void
}) {
  const { Colors, Radii } = useTheme()
  const placesStyles = useMemo(
    () =>
      StyleSheet.create({
        placesSection: { marginBottom: Spacing.lg },
        sectionLabel: {
          ...Typography.label,
          fontSize: 13,
          color: Colors.secondaryText,
          marginBottom: Spacing.sm,
          letterSpacing: 0.5,
          paddingLeft: Spacing.lg,
        },
        placesRow: { flexDirection: 'row', gap: Spacing.sm, paddingLeft: Spacing.lg },
        placesTile: { alignItems: 'center', width: 68 },
        placesTileIcon: {
          width: 54,
          height: 54,
          borderRadius: Radii.button,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        placesTileIconSaved: { backgroundColor: Colors.blue },
        scrollbarTrack: {
          height: 3,
          borderRadius: 2,
          backgroundColor: Colors.separator,
          marginTop: Spacing.sm,
        },
        scrollbarThumb: { height: 3, borderRadius: 2, backgroundColor: Colors.secondaryText },
      }),
    [Colors, Radii],
  )
  const [scrollX, setScrollX] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)

  const tileCount = NAMED_PLACES.length + savedPlaces.custom.length + 1
  const contentWidth = tileCount * 68 + (tileCount - 1) * Spacing.sm
  const scrollable = containerWidth > 0 && contentWidth > containerWidth
  const thumbWidth = scrollable
    ? Math.max(24, Math.min(containerWidth * 0.4, (containerWidth / contentWidth) * containerWidth))
    : 0
  const thumbLeft = scrollable
    ? (scrollX / (contentWidth - containerWidth)) * (containerWidth - thumbWidth)
    : 0

  return (
    <View style={placesStyles.placesSection}>
      <Text style={placesStyles.sectionLabel}>PLACES</Text>
      <NativeViewGestureHandler disallowInterruption>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={placesStyles.placesRow}
          onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
          scrollEventThrottle={16}
        >
          {NAMED_PLACES.map(({ key, icon, label }) => {
            const saved = Boolean(savedPlaces[key])
            return (
              <TouchableOpacity
                key={key}
                style={placesStyles.placesTile}
                activeOpacity={0.75}
                onPress={() => onPress(key)}
                onLongPress={() => onLongPress(key)}
                accessibilityRole="button"
                accessibilityLabel={
                  saved ? `${label}: ${savedPlaces[key]!.address}` : `Set ${label}`
                }
                accessibilityHint={
                  saved
                    ? 'Tap to plan journey. Long press to edit or remove.'
                    : 'Tap to set your address'
                }
              >
                <View
                  style={[placesStyles.placesTileIcon, saved && placesStyles.placesTileIconSaved]}
                >
                  <MaterialIcons name={icon} size={24} color={saved ? Colors.card : Colors.blue} />
                </View>
                <Text style={[Typography.label, { color: Colors.text, marginTop: 4, fontSize: 13 }]}>
                  {label}
                </Text>
                {!saved && (
                  <Text style={[Typography.label, { color: Colors.blue, marginTop: 1, fontSize: 13 }]}>Add</Text>
                )}
              </TouchableOpacity>
            )
          })}
          {savedPlaces.custom.map((place) => (
            <TouchableOpacity
              key={place.id}
              style={placesStyles.placesTile}
              activeOpacity={0.75}
              onPress={() => onCustomPlacePress(place)}
              onLongPress={() => onCustomPlaceLongPress(place)}
              accessibilityRole="button"
              accessibilityLabel={`${place.name}: ${place.address}`}
              accessibilityHint="Tap to plan journey. Long press to remove."
            >
              <View style={[placesStyles.placesTileIcon, placesStyles.placesTileIconSaved]}>
                <MaterialIcons
                  name={place.icon as keyof typeof MaterialIcons.glyphMap}
                  size={24}
                  color={Colors.card}
                />
              </View>
              <Text
                style={[Typography.label, { color: Colors.text, marginTop: 4, fontSize: 13 }]}
                numberOfLines={1}
              >
                {place.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={placesStyles.placesTile}
            activeOpacity={0.75}
            onPress={onAddPress}
          >
            <View style={placesStyles.placesTileIcon}>
              <MaterialIcons name="add" size={24} color={Colors.blue} />
            </View>
            <Text style={[Typography.label, { color: Colors.text, marginTop: 4, fontSize: 13 }]}>Add</Text>
          </TouchableOpacity>
        </ScrollView>
      </NativeViewGestureHandler>
      {scrollable && (
        <View style={placesStyles.scrollbarTrack}>
          <View
            style={[placesStyles.scrollbarThumb, { width: thumbWidth, marginLeft: thumbLeft }]}
          />
        </View>
      )}
    </View>
  )
}

function SavedRow({ item, onPress }: { item: SavedJourney; onPress: () => void }) {
  const { Colors, Radii } = useTheme()
  const savedRowStyles = useMemo(
    () =>
      StyleSheet.create({
        savedRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.lg,
        },
        savedRowIcon: {
          width: 40,
          height: 40,
          borderRadius: Radii.icon,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [Colors, Radii],
  )
  const from = item.from?.label ?? 'Start'
  const to = item.to?.label ?? 'Destination'
  const time = `${clockTime(item.journey.startDateTime)} → ${clockTime(item.journey.arrivalDateTime)}`
  return (
    <TouchableOpacity onPress={onPress} style={savedRowStyles.savedRow} activeOpacity={0.7}>
      <View style={savedRowStyles.savedRowIcon}>
        <MaterialIcons name="schedule" size={20} color={Colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodyBold, { color: Colors.text, fontSize: 17 }]} numberOfLines={1}>
          {from}
        </Text>
        <Text style={[Typography.caption, { color: Colors.secondaryText, fontSize: 14 }]} numberOfLines={1}>
          → {to} · {item.journey.duration} min · {time}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={Colors.tertiaryText} />
    </TouchableOpacity>
  )
}

function StationResultRow({ station, onPress }: { station: StationDetail; onPress: () => void }) {
  const { Colors, Radii } = useTheme()
  const resultRowStyles = useMemo(
    () =>
      StyleSheet.create({
        resultRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingVertical: Spacing.sm,
        },
        resultRowIcon: {
          width: 40,
          height: 40,
          borderRadius: Radii.icon,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [Colors, Radii],
  )
  return (
    <TouchableOpacity onPress={onPress} style={resultRowStyles.resultRow} activeOpacity={0.7}>
      <View style={resultRowStyles.resultRowIcon}>
        <MaterialIcons name="train" size={20} color={Colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodyBold, { color: Colors.text, fontSize: 17 }]} numberOfLines={1}>
          {station.name}
        </Text>
        <Text style={[Typography.caption, { color: Colors.secondaryText, fontSize: 14 }]}>Station</Text>
      </View>
      <MaterialIcons name="chevron-right" size={20} color={Colors.tertiaryText} />
    </TouchableOpacity>
  )
}

function LocationResultRow({
  suggestion,
  onPress,
}: {
  suggestion: LocationSuggestion
  onPress: () => void
}) {
  const { Colors, Radii } = useTheme()
  const locResultStyles = useMemo(
    () =>
      StyleSheet.create({
        resultRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingVertical: Spacing.sm,
        },
        resultRowIcon: {
          width: 40,
          height: 40,
          borderRadius: Radii.icon,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [Colors, Radii],
  )
  return (
    <TouchableOpacity onPress={onPress} style={locResultStyles.resultRow} activeOpacity={0.7}>
      <View style={locResultStyles.resultRowIcon}>
        <MaterialIcons name="place" size={20} color={Colors.secondaryText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[Typography.body, { color: Colors.text, fontWeight: '600', fontSize: 17 }]}
          numberOfLines={1}
        >
          {suggestion.label}
        </Text>
        {suggestion.subtitle ? (
          <Text style={[Typography.caption, { color: Colors.secondaryText, fontSize: 14 }]} numberOfLines={1}>
            {suggestion.subtitle}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={20} color={Colors.tertiaryText} />
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  savedJourneys: SavedJourney[]
  savedPlaces: SavedPlaces
  onSavedJourneyPress: (item: SavedJourney) => void
  onStationPress: (stationName: string) => void
  onLocationSelect: (from: ResolvedLocation | undefined, to: ResolvedLocation) => void
  onPlacePress: (key: 'home' | 'work') => void
  onPlaceLongPress: (key: 'home' | 'work') => void
  onCustomPlacePress: (place: CustomPlace) => void
  onCustomPlaceLongPress: (place: CustomPlace) => void
  onAddCustomPlace: () => void
  /** Called whenever the sheet snaps, with the visible height in pixels. */
  onSnapChange?: (visibleHeight: number) => void
}

export const SearchActionSheet = forwardRef<SearchActionSheetHandle, Props>(
  function SearchActionSheet(
    {
      savedJourneys,
      savedPlaces,
      onSavedJourneyPress,
      onStationPress,
      onLocationSelect,
      onPlacePress,
      onPlaceLongPress,
      onCustomPlacePress,
      onCustomPlaceLongPress,
      onAddCustomPlace,
      onSnapChange,
    },
    ref,
  ) {
    const { Colors, Radii } = useTheme()
    const styles = useMemo(
      () =>
        StyleSheet.create({
          // Search
          searchRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingHorizontal: Spacing.lg,
            paddingBottom: Spacing.lg,
          },
          searchPill: {
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: Colors.searchBg,
            borderRadius: Radii.pill,
            paddingHorizontal: Spacing.md,
            paddingVertical: 10,
          },
          searchPillExpanded: {
            backgroundColor: Colors.searchBg,
          },
          searchInput: {
            flex: 1,
            fontSize: 18,
            color: Colors.text,
            padding: 0,
          },
          cancelBtn: {
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: Colors.searchBg,
            alignItems: 'center',
            justifyContent: 'center',
          },

          // Body wrapper
          bodyWrapper: {
            flex: 1,
          },

          // Places
          placesSection: {
            marginBottom: Spacing.lg,
            paddingHorizontal: Spacing.lg,
          },
          sectionLabel: {
            ...Typography.label,
            fontSize: 13,
            color: Colors.secondaryText,
            marginBottom: Spacing.sm,
            letterSpacing: 0.5,
            paddingHorizontal: Spacing.lg,
          },
          placesRow: {
            flexDirection: 'row',
            gap: Spacing.md,
          },
          placesTile: {
            alignItems: 'center',
            width: 64,
          },
          placesTileIcon: {
            width: 50,
            height: 50,
            borderRadius: Radii.button,
            backgroundColor: Colors.searchBg,
            alignItems: 'center',
            justifyContent: 'center',
          },
          placesTileIconSaved: {
            backgroundColor: Colors.blue,
          },
          scrollbarTrack: {
            height: 3,
            borderRadius: 2,
            backgroundColor: Colors.separator,
            marginTop: Spacing.sm,
          },
          scrollbarThumb: {
            height: 3,
            borderRadius: 2,
            backgroundColor: Colors.secondaryText,
          },

          // Saved journeys
          savedRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingVertical: Spacing.sm,
            paddingHorizontal: Spacing.lg,
          },
          savedRowIcon: {
            width: 34,
            height: 34,
            borderRadius: Radii.icon,
            backgroundColor: Colors.searchBg,
            alignItems: 'center',
            justifyContent: 'center',
          },

          // Search results
          resultsScroll: {
            flex: 1,
            paddingHorizontal: Spacing.lg,
          },
          resultRow: {
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            paddingVertical: Spacing.sm,
          },
          resultRowIcon: {
            width: 34,
            height: 34,
            borderRadius: Radii.icon,
            backgroundColor: Colors.searchBg,
            alignItems: 'center',
            justifyContent: 'center',
          },
          gpsLoadingRow: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: Spacing.sm,
            marginBottom: Spacing.sm,
          },
          emptyState: {
            alignItems: 'center',
            paddingTop: Spacing.xxl * 2,
          },

          separator: {
            height: StyleSheet.hairlineWidth,
            backgroundColor: Colors.separator,
            marginLeft: Spacing.lg + 34 + Spacing.md,
          },
        }),
      [Colors, Radii],
    )
    const insets = useSafeAreaInsets()
    const [expanded, setExpanded] = useState(false)
    const [inputFocused, setInputFocused] = useState(false)
    const [query, setQuery] = useState('')
    const [stationResults, setStationResults] = useState<StationDetail[]>([])
    const [locationResults, setLocationResults] = useState<LocationSuggestion[]>([])
    const [searching, setSearching] = useState(false)
    const [gpsLoading, setGpsLoading] = useState(false)
    const [recentLocations, setRecentLocations] = useState<RecentLocation[]>([])
    const [searchRowH, setSearchRowH] = useState(60)

    const inputRef = useRef<TextInput>(null)
    const sheetRef = useRef<BottomSheetRef>(null)
    const shouldFocusOnOpen = useRef(false)

    const { stations } = useStations()
    const cachedCoords = useAppLocation()
    const { workStation } = useWorkShift()
    const { user } = useAuth()
    // For staff on shift, the origin is their station (GPS is unreliable underground).
    const shiftStation = user?.role === 'trusted' && workStation ? workStation : null

    // ── Load recents ──────────────────────────────────────────────────────

    useEffect(() => {
      getRecentLocations().then(setRecentLocations)
    }, [])

    // ── Debounced search ──────────────────────────────────────────────────

    useEffect(() => {
      if (query.length < 3) return
      setSearching(true)
      const timer = setTimeout(async () => {
        const matched = stations
          .map((s) => ({ station: s, score: fuzzyScore(query, s.name) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map(({ station }) => station)
        setStationResults(matched)
        const locs = await searchLocations(query)
        setLocationResults(locs)
        setSearching(false)
      }, 400)
      return () => clearTimeout(timer)
    }, [query, stations])

    // ── Snap helpers ──────────────────────────────────────────────────────

    const expand = useCallback(() => {
      shouldFocusOnOpen.current = true
      setExpanded(true)
      sheetRef.current?.snapToIndex(SNAP_IDX_OPEN)
    }, [])

    const collapse = useCallback(() => {
      Keyboard.dismiss()
      setQuery('')
      setExpanded(false)
      sheetRef.current?.snapToIndex(SNAP_IDX_HOME)
    }, [])

    const dismiss = useCallback(() => {
      Keyboard.dismiss()
      setQuery('')
      sheetRef.current?.close()
    }, [])

    const restore = useCallback(() => {
      sheetRef.current?.snapToIndex(SNAP_IDX_HOME)
    }, [])

    useImperativeHandle(ref, () => ({ expand, dismiss, restore }), [expand, dismiss, restore])

    function handleSheetChange(index: number) {
      if (index === SNAP_IDX_OPEN) {
        setExpanded(true)
        getRecentLocations().then(setRecentLocations)
        if (shouldFocusOnOpen.current) {
          inputRef.current?.focus()
        }
        shouldFocusOnOpen.current = false
      } else {
        setExpanded(false)
        setQuery('')
      }
      onSnapChange?.(SNAP_POINTS[index] ?? 0)
    }

    // ── Location tap handler ──────────────────────────────────────────────

    async function handleLocationSelect(suggestion: LocationSuggestion) {
      setGpsLoading(true)
      try {
        const toPostcode = await postcodeForSuggestion(suggestion)
        if (!toPostcode) {
          Alert.alert(
            'Location error',
            "Couldn't resolve that destination. Try entering a postcode instead.",
          )
          return
        }
        const to: ResolvedLocation = { postcode: toPostcode, label: suggestion.label }

        addRecentLocation(suggestion.label, toPostcode)
        getRecentLocations().then(setRecentLocations)

        let from: ResolvedLocation | undefined
        const shiftDetail = shiftStation ? stations.find((s) => s.name === shiftStation) : undefined
        if (shiftDetail?.latitude != null && shiftDetail?.longitude != null) {
          const fromResult = await resolveToPostcode(
            `${shiftDetail.latitude},${shiftDetail.longitude}`,
          )
          if (!('error' in fromResult)) {
            from = { postcode: fromResult.postcode, label: `On shift: ${shiftDetail.name}` }
          }
        } else if (cachedCoords) {
          const fromResult = await resolveToPostcode(
            `${cachedCoords.latitude},${cachedCoords.longitude}`,
          )
          if (!('error' in fromResult)) {
            from = { postcode: fromResult.postcode, label: 'Current location' }
          }
        }

        collapse()
        onLocationSelect(from, to)
      } catch (err) {
        if (isOfflineError(err)) alertOffline('plan a journey')
      } finally {
        setGpsLoading(false)
      }
    }

    async function handleRecentSelect(item: RecentLocation) {
      if (item.postcode === null) {
        // Station recent
        collapse()
        onStationPress(item.label)
      } else {
        // Location recent — resolve from GPS and open journey planner
        setGpsLoading(true)
        try {
          const to: ResolvedLocation = { postcode: item.postcode, label: item.label }
          let from: ResolvedLocation | undefined
          if (cachedCoords) {
            // Resolving the start from GPS is best-effort: if we're offline, still open the
            // planner with just the destination — the plan step then surfaces the offline alert.
            try {
              const fromResult = await resolveToPostcode(
                `${cachedCoords.latitude},${cachedCoords.longitude}`,
              )
              if (!('error' in fromResult)) {
                from = { postcode: fromResult.postcode, label: 'Current location' }
              }
            } catch (err) {
              if (!isOfflineError(err)) throw err
            }
          }
          addRecentLocation(item.label, item.postcode)
          collapse()
          onLocationSelect(from, to)
        } finally {
          setGpsLoading(false)
        }
      }
    }

    // ── Render ────────────────────────────────────────────────────────────

    const hasQuery = query.length >= 3
    const hasResults = stationResults.length > 0 || locationResults.length > 0

    return (
      <BottomSheet
        ref={sheetRef}
        index={SNAP_IDX_HOME}
        snapPoints={SNAP_POINTS}
        onChange={handleSheetChange}
      >
        {/* Search bar + recents dropdown */}
        <View style={{ zIndex: 10 }}>
          <View
            style={styles.searchRow}
            onLayout={(e) => setSearchRowH(e.nativeEvent.layout.height)}
          >
            <TouchableOpacity
              style={[styles.searchPill, expanded && styles.searchPillExpanded]}
              onPress={expanded ? undefined : expand}
              activeOpacity={expanded ? 1 : 0.8}
            >
              <MaterialIcons
                name="search"
                size={22}
                color={Colors.secondaryText}
                style={{ marginRight: 6 }}
              />
              <View style={{ flex: 1, pointerEvents: expanded ? 'auto' : 'none' }}>
                <TextInput
                  ref={inputRef}
                  style={styles.searchInput}
                  placeholder="Where to?"
                  placeholderTextColor={Colors.placeholderText}
                  editable={expanded}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setTimeout(() => setInputFocused(false), 150)}
                  onSubmitEditing={() => {
                    if (stationResults.length > 0) {
                      addRecentLocation(stationResults[0].name, null)
                      collapse()
                      onStationPress(stationResults[0].name)
                    } else if (locationResults.length > 0) {
                      handleLocationSelect(locationResults[0])
                    }
                  }}
                />
              </View>
              {expanded && hasQuery && searching && (
                <ActivityIndicator size="small" color={Colors.secondaryText} />
              )}
            </TouchableOpacity>

            {(inputFocused || hasQuery) && (
              <TouchableOpacity
                onPress={collapse}
                style={styles.cancelBtn}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Close search"
              >
                <MaterialIcons name="close" size={22} color={Colors.secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {/* Recents dropdown — floats below the search pill when input is focused with no query */}
          {inputFocused && !hasQuery && recentLocations.length > 0 && (
            <View
              style={{
                position: 'absolute',
                top: searchRowH - Spacing.lg + 4,
                left: Spacing.lg,
                right: Spacing.lg,
                zIndex: 20,
                borderWidth: 1,
                borderColor: Colors.border,
                borderRadius: Radii.button,
                backgroundColor: Colors.card,
                overflow: 'hidden',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.12,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              {recentLocations.slice(0, 5).map((item, i) => (
                <TouchableOpacity
                  key={`${item.label}-${i}`}
                  onPress={() => handleRecentSelect(item)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: Spacing.md,
                    paddingHorizontal: Spacing.lg,
                    minHeight: 60,
                    borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: Colors.separator,
                  }}
                >
                  <MaterialIcons name="history" size={20} color={Colors.secondaryText} />
                  <Text
                    style={[Typography.body, { color: Colors.text, flex: 1, fontSize: 17 }]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <MaterialIcons name="chevron-right" size={20} color={Colors.tertiaryText} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Body: search results when querying, home content otherwise */}
        {hasQuery ? (
          <BottomSheetScrollView
            style={styles.resultsScroll}
            contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.md }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {gpsLoading && (
              <View style={styles.gpsLoadingRow}>
                <ActivityIndicator size="small" color={Colors.blue} />
                <Text style={[Typography.caption, { color: Colors.secondaryText, marginLeft: 8 }]}>
                  Getting your location…
                </Text>
              </View>
            )}

            {stationResults.length > 0 && (
              <View>
                <Text style={styles.sectionLabel}>STATIONS</Text>
                {stationResults.map((s) => (
                  <View key={s.id}>
                    <StationResultRow
                      station={s}
                      onPress={() => {
                        addRecentLocation(s.name, null)
                        collapse()
                        onStationPress(s.name)
                      }}
                    />
                    <View style={styles.separator} />
                  </View>
                ))}
              </View>
            )}

            {locationResults.length > 0 && (
              <View style={{ marginTop: stationResults.length > 0 ? Spacing.lg : 0 }}>
                <Text style={styles.sectionLabel}>PLACES</Text>
                {locationResults.map((loc, i) => (
                  <View key={i}>
                    <LocationResultRow suggestion={loc} onPress={() => handleLocationSelect(loc)} />
                    <View style={styles.separator} />
                  </View>
                ))}
              </View>
            )}

            {!searching && !hasResults && (
              <View style={styles.emptyState}>
                <MaterialIcons name="search-off" size={36} color={Colors.tertiaryText} />
                <Text
                  style={[
                    Typography.caption,
                    { color: Colors.secondaryText, marginTop: Spacing.sm },
                  ]}
                >
                  {`No results for "${query}"`}
                </Text>
              </View>
            )}
          </BottomSheetScrollView>
        ) : (
          <BottomSheetFlatList
            data={[]}
            keyExtractor={() => ''}
            renderItem={() => null}
            ListHeaderComponent={
              <View style={{ paddingBottom: insets.bottom + Spacing.md }}>
                <PlacesRow
                  savedPlaces={savedPlaces}
                  onPress={onPlacePress}
                  onLongPress={onPlaceLongPress}
                  onCustomPlacePress={onCustomPlacePress}
                  onCustomPlaceLongPress={onCustomPlaceLongPress}
                  onAddPress={onAddCustomPlace}
                />

                <Text style={styles.sectionLabel}>SAVED JOURNEYS</Text>
                {savedJourneys.length === 0 ? (
                  <Text
                    style={[
                      Typography.caption,
                      { color: Colors.secondaryText, paddingVertical: 6, paddingHorizontal: Spacing.lg },
                    ]}
                  >
                    No saved journeys yet — plan one to save it here.
                  </Text>
                ) : (
                  savedJourneys.map((item, i) => (
                    <View key={item.id}>
                      <SavedRow item={item} onPress={() => onSavedJourneyPress(item)} />
                      {i < savedJourneys.length - 1 && <View style={styles.separator} />}
                    </View>
                  ))
                )}
              </View>
            }
          />
        )}
      </BottomSheet>
    )
  },
)
