// Bottom sheet that lives inside MapHomeScreen.
// Three snap points:
//   index 0 – PILL   (~72 px)  : only the search pill visible; map in focus
//   index 1 – HOME   (~320 px) : Places row + Saved Journeys (default / launch state)
//   index 2 – OPEN   (82 % of screen) : search active; results fill the sheet
//
// Gestures, keyboard avoidance, and scroll-vs-drag conflicts are all handled by
// @gorhom/bottom-sheet — no PanResponder or Animated wiring needed here.

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { CustomPlace, SavedPlaces } from '@/features/journey/api/savedPlaces'
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
import { Colors, Radii, Spacing, Typography } from '@/theme'
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
const SNAP_POINTS = [72, 320, SCREEN_H * 0.82]

const SNAP_IDX_PILL = 0
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
  const [scrollX, setScrollX] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)

  const tileCount = NAMED_PLACES.length + savedPlaces.custom.length + 1
  const contentWidth = tileCount * 64 + (tileCount - 1) * Spacing.md
  const scrollable = containerWidth > 0 && contentWidth > containerWidth
  const thumbWidth = scrollable
    ? Math.max(24, Math.min(containerWidth * 0.4, (containerWidth / contentWidth) * containerWidth))
    : 0
  const thumbLeft = scrollable
    ? (scrollX / (contentWidth - containerWidth)) * (containerWidth - thumbWidth)
    : 0

  return (
    <View style={styles.placesSection}>
      <Text style={styles.sectionLabel}>PLACES</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.placesRow}
        onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        scrollEventThrottle={16}
      >
        {NAMED_PLACES.map(({ key, icon, label }) => {
          const saved = Boolean(savedPlaces[key])
          return (
            <TouchableOpacity
              key={key}
              style={styles.placesTile}
              activeOpacity={0.75}
              onPress={() => onPress(key)}
              onLongPress={() => onLongPress(key)}
              accessibilityRole="button"
              accessibilityLabel={saved ? `${label}: ${savedPlaces[key]!.address}` : `Set ${label}`}
              accessibilityHint={
                saved
                  ? 'Tap to plan journey. Long press to edit or remove.'
                  : 'Tap to set your address'
              }
            >
              <View style={[styles.placesTileIcon, saved && styles.placesTileIconSaved]}>
                <MaterialIcons name={icon} size={22} color={saved ? Colors.card : Colors.blue} />
              </View>
              <Text style={[Typography.label, { color: Colors.text, marginTop: 4 }]}>{label}</Text>
              {!saved && (
                <Text style={[Typography.label, { color: Colors.blue, marginTop: 1 }]}>Add</Text>
              )}
            </TouchableOpacity>
          )
        })}
        {savedPlaces.custom.map((place) => (
          <TouchableOpacity
            key={place.id}
            style={styles.placesTile}
            activeOpacity={0.75}
            onPress={() => onCustomPlacePress(place)}
            onLongPress={() => onCustomPlaceLongPress(place)}
            accessibilityRole="button"
            accessibilityLabel={`${place.name}: ${place.address}`}
            accessibilityHint="Tap to plan journey. Long press to remove."
          >
            <View style={[styles.placesTileIcon, styles.placesTileIconSaved]}>
              <MaterialIcons
                name={place.icon as keyof typeof MaterialIcons.glyphMap}
                size={22}
                color={Colors.card}
              />
            </View>
            <Text
              style={[Typography.label, { color: Colors.text, marginTop: 4 }]}
              numberOfLines={1}
            >
              {place.name}
            </Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.placesTile} activeOpacity={0.75} onPress={onAddPress}>
          <View style={styles.placesTileIcon}>
            <MaterialIcons name="add" size={22} color={Colors.blue} />
          </View>
          <Text style={[Typography.label, { color: Colors.text, marginTop: 4 }]}>Add</Text>
        </TouchableOpacity>
      </ScrollView>
      {scrollable && (
        <View style={styles.scrollbarTrack}>
          <View style={[styles.scrollbarThumb, { width: thumbWidth, marginLeft: thumbLeft }]} />
        </View>
      )}
    </View>
  )
}

function SavedRow({ item, onPress }: { item: SavedJourney; onPress: () => void }) {
  const from = item.from?.label ?? 'Start'
  const to = item.to?.label ?? 'Destination'
  const time = `${clockTime(item.journey.startDateTime)} → ${clockTime(item.journey.arrivalDateTime)}`
  return (
    <TouchableOpacity onPress={onPress} style={styles.savedRow} activeOpacity={0.7}>
      <View style={styles.savedRowIcon}>
        <MaterialIcons name="schedule" size={16} color={Colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodyBold, { color: Colors.text }]} numberOfLines={1}>
          {from}
        </Text>
        <Text style={[Typography.caption, { color: Colors.secondaryText }]} numberOfLines={1}>
          → {to} · {item.journey.duration} min · {time}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={16} color={Colors.tertiaryText} />
    </TouchableOpacity>
  )
}

function StationResultRow({ station, onPress }: { station: StationDetail; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.resultRow} activeOpacity={0.7}>
      <View style={styles.resultRowIcon}>
        <MaterialIcons name="train" size={16} color={Colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[Typography.bodyBold, { color: Colors.text }]} numberOfLines={1}>
          {station.name}
        </Text>
        <Text style={[Typography.caption, { color: Colors.secondaryText }]}>Station</Text>
      </View>
      <MaterialIcons name="chevron-right" size={16} color={Colors.tertiaryText} />
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
  return (
    <TouchableOpacity onPress={onPress} style={styles.resultRow} activeOpacity={0.7}>
      <View style={styles.resultRowIcon}>
        <MaterialIcons name="place" size={16} color={Colors.secondaryText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[Typography.body, { color: Colors.text, fontWeight: '600' }]}
          numberOfLines={1}
        >
          {suggestion.label}
        </Text>
        {suggestion.subtitle ? (
          <Text style={[Typography.caption, { color: Colors.secondaryText }]} numberOfLines={1}>
            {suggestion.subtitle}
          </Text>
        ) : null}
      </View>
      <MaterialIcons name="chevron-right" size={16} color={Colors.tertiaryText} />
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
    const insets = useSafeAreaInsets()
    const [expanded, setExpanded] = useState(false)
    const [query, setQuery] = useState('')
    const [stationResults, setStationResults] = useState<StationDetail[]>([])
    const [locationResults, setLocationResults] = useState<LocationSuggestion[]>([])
    const [searching, setSearching] = useState(false)
    const [gpsLoading, setGpsLoading] = useState(false)

    const inputRef = useRef<TextInput>(null)
    const sheetRef = useRef<BottomSheetRef>(null)

    const { stations } = useStations()
    const cachedCoords = useAppLocation()

    // ── Debounced search ──────────────────────────────────────────────────

    useEffect(() => {
      if (query.length < 3) {
        setStationResults([])
        setLocationResults([])
        setSearching(false)
        return
      }
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
      sheetRef.current?.snapToIndex(SNAP_IDX_PILL)
    }, [])

    const restore = useCallback(() => {
      sheetRef.current?.snapToIndex(SNAP_IDX_HOME)
    }, [])

    useImperativeHandle(ref, () => ({ expand, dismiss, restore }), [expand, dismiss, restore])

    function handleSheetChange(index: number) {
      if (index === SNAP_IDX_OPEN) {
        setExpanded(true)
        inputRef.current?.focus()
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

        let from: ResolvedLocation | undefined
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const pos =
            cachedCoords ??
            (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
              .coords
          const fromResult = await resolveToPostcode(`${pos.latitude},${pos.longitude}`)
          if (!('error' in fromResult)) {
            from = { postcode: fromResult.postcode, label: 'Current location' }
          }
        }

        collapse()
        onLocationSelect(from, to)
      } finally {
        setGpsLoading(false)
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
        {/* Search bar */}
        <View style={styles.searchRow}>
          <TouchableOpacity
            style={[styles.searchPill, expanded && styles.searchPillExpanded]}
            onPress={expanded ? undefined : expand}
            activeOpacity={expanded ? 1 : 0.8}
          >
            <MaterialIcons
              name="search"
              size={18}
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
              />
            </View>
            {expanded && searching && (
              <ActivityIndicator size="small" color={Colors.secondaryText} />
            )}
          </TouchableOpacity>

          {expanded && (
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
                      { color: Colors.secondaryText, paddingVertical: 6 },
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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
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
    fontSize: 15,
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
})
