// Animated bottom sheet that lives inside MapHomeScreen.
// The card is always mounted; tapping the search bar slides it UP in place
// (translateY: SLIDE_OFFSET → 0). No new screen is pushed.
//
// Collapsed: shows Places row + Saved Journeys.
// Expanded, empty query: same content (idle state).
// Expanded, query ≥ 3 chars: debounced station + address search results replace the body.
//
// Single spring covers 100% of the travel for a clean, continuous slide.
// Dismiss reverses with a slightly stiffer spring for a snappier close.

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import type { CustomPlace, SavedPlaces } from '@/features/journey/api/savedPlaces'

// useNativeDriver is not available on web (no native animation module).
const USE_NATIVE_DRIVER = Platform.OS !== 'web'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import { Colors, Radii, Shadows, Spacing, Typography } from '@/theme'

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const SCREEN_H = Dimensions.get('window').height
// Total card height (sets how much map is visible above when expanded: ~18%).
const SHEET_H = SCREEN_H * 0.82
// How much of the card is visible in the collapsed state.
const COLLAPSED_VISIBLE = 300
// How far to translate the card down so only COLLAPSED_VISIBLE is shown.
const SLIDE_OFFSET = SHEET_H - COLLAPSED_VISIBLE

// ---------------------------------------------------------------------------
// Public handle
// ---------------------------------------------------------------------------

export type SearchActionSheetHandle = {
  expand: () => void
}

// ---------------------------------------------------------------------------
// Internal sub-components
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

  // Compute content width directly from tile count — avoids onContentSizeChange
  // being unreliable on web (it reports scrollWidth = clientWidth).
  // Tile width is from styles.placesTile (64px), gap is Spacing.md (12px).
  const tileCount = NAMED_PLACES.length + savedPlaces.custom.length + 1 // +1 for Add
  const contentWidth = tileCount * 64 + (tileCount - 1) * Spacing.md

  const scrollable = containerWidth > 0 && contentWidth > containerWidth
  const thumbWidth = scrollable
    ? Math.max(24, (containerWidth / contentWidth) * containerWidth)
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
              accessibilityHint={saved ? 'Tap to plan journey. Long press to edit or remove.' : 'Tap to set your address'}
            >
              <View style={[styles.placesTileIcon, saved && styles.placesTileIconSaved]}>
                <MaterialIcons name={icon} size={22} color={saved ? Colors.card : Colors.blue} />
              </View>
              <Text style={[Typography.label, { color: Colors.text, marginTop: 4 }]}>{label}</Text>
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
        <TouchableOpacity
          style={styles.placesTile}
          activeOpacity={0.75}
          onPress={onAddPress}
        >
          <View style={styles.placesTileIcon}>
            <MaterialIcons name="add" size={22} color={Colors.blue} />
          </View>
          <Text style={[Typography.label, { color: Colors.text, marginTop: 4 }]}>Add</Text>
        </TouchableOpacity>
      </ScrollView>
      {scrollable && (
        <View style={styles.scrollbarTrack}>
          <View style={[styles.scrollbarThumb, { width: thumbWidth, transform: [{ translateX: thumbLeft }] }]} />
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

    const { stations } = useStations()
    const cachedCoords = useAppLocation()

    // Start translated down so only COLLAPSED_VISIBLE is showing. A lazy useState keeps the single
    // Animated.Value stable across renders while staying safe to read during render.
    const [translateY] = useState(() => new Animated.Value(SLIDE_OFFSET))

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

    // ── Animation helpers ─────────────────────────────────────────────────

    const expand = useCallback(() => {
      setExpanded(true)
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 130,
        damping: 22,
        mass: 1.1,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => {
        inputRef.current?.focus()
      })
    }, [translateY])

    const collapse = useCallback(() => {
      Keyboard.dismiss()
      setQuery('')
      Animated.spring(translateY, {
        toValue: SLIDE_OFFSET,
        stiffness: 200,
        damping: 28,
        mass: 0.9,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => setExpanded(false))
    }, [translateY])

    useImperativeHandle(ref, () => ({ expand }), [expand])

    // ── Drag to slide ─────────────────────────────────────────────────────
    // The drag handle implies the sheet can be dragged; wire that up so dragging up expands and
    // dragging down collapses, snapping on release. Tap-to-expand still works because the pan only
    // claims the gesture once the finger has moved vertically — a tap never triggers it. expand /
    // collapse are stable (their only dependency is the stable Animated.Value), so the responder
    // created once below always calls the right version.

    // Created once via a lazy initialiser; panHandlers is a plain value (not a ref) so it's safe to
    // spread during render. `dragStart` lives in the responder's own closure — shared across its
    // handlers and persisting between grant/move/release — holding the sheet's translateY when the
    // drag began so the move tracks the finger 1:1.
    // react-hooks/refs mis-reads the responder's closure-captured `dragStart` as a ref accessed
    // during render; it's an ordinary closure variable and the responder is built exactly once.
    // eslint-disable-next-line react-hooks/refs
    const [panHandlers] = useState(() => {
      let dragStart = SLIDE_OFFSET
      return PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, g) =>
          Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation((value) => {
            dragStart = value
          })
        },
        onPanResponderMove: (_evt, g) => {
          translateY.setValue(Math.min(SLIDE_OFFSET, Math.max(0, dragStart + g.dy)))
        },
        onPanResponderRelease: (_evt, g) => {
          const landing = dragStart + g.dy
          const flungUp = g.vy < -0.5
          const flungDown = g.vy > 0.5
          // Snap to whichever end is closer, unless the gesture was a clear fling either way.
          if (flungUp || (!flungDown && landing < SLIDE_OFFSET / 2)) expand()
          else collapse()
        },
      }).panHandlers
    })

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

        // Attempt to resolve current location for the "from" field, but don't
        // block navigation if unavailable — the journey planner handles an empty from.
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
      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + Spacing.md,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Drag handle — its zone is draggable to slide the sheet up/down */}
        <View {...panHandlers} style={styles.handleZone}>
          <View style={styles.handle} />
        </View>

        {/* Search bar — also draggable, so the whole header acts as a grab area */}
        <View {...panHandlers} style={styles.searchRow}>
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
            {/* pointerEvents="none" when collapsed so touches pass through to the
                TouchableOpacity on native (editable=false alone doesn't stop touch capture). */}
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
            {!expanded && <MaterialIcons name="mic" size={16} color={Colors.secondaryText} />}
            {expanded && searching && (
              <ActivityIndicator size="small" color={Colors.secondaryText} />
            )}
          </TouchableOpacity>

          {expanded && (
            <TouchableOpacity onPress={collapse} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={[Typography.bodyBold, { color: Colors.blue }]}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Body: search results when querying, idle content otherwise */}
        {hasQuery ? (
          <ScrollView
            style={styles.resultsScroll}
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
          </ScrollView>
        ) : (
          <>
            <PlacesRow
              savedPlaces={savedPlaces}
              onPress={onPlacePress}
              onLongPress={onPlaceLongPress}
              onCustomPlacePress={onCustomPlacePress}
              onCustomPlaceLongPress={onCustomPlaceLongPress}
              onAddPress={onAddCustomPlace}
            />

            <View>
              <Text style={styles.sectionLabel}>SAVED JOURNEYS</Text>
              {savedJourneys.length === 0 ? (
                <Text
                  style={[Typography.caption, { color: Colors.secondaryText, paddingVertical: 6 }]}
                >
                  No saved journeys yet — plan one to save it here.
                </Text>
              ) : (
                <FlatList
                  data={savedJourneys}
                  keyExtractor={(item) => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <SavedRow item={item} onPress={() => onSavedJourneyPress(item)} />
                  )}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              )}
            </View>
          </>
        )}
      </Animated.View>
    )
  },
)

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_H,
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.card + 4,
    borderTopRightRadius: Radii.card + 4,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    ...Shadows.top,
  },
  // Enlarged, full-width hit area around the handle so it's easy to grab and drag.
  handleZone: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: Spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radii.handle,
    backgroundColor: Colors.separator,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
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
  cancelBtn: {},

  // Places
  placesSection: {
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    ...Typography.label,
    color: Colors.secondaryText,
    marginBottom: Spacing.sm,
    letterSpacing: 0.5,
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
    overflow: 'hidden',
  },
  scrollbarThumb: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.tertiaryText,
  },

  // Saved journeys
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
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
    marginLeft: 50,
  },
})
