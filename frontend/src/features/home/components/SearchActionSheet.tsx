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
import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

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

const PLACES = [
  { key: 'home', icon: 'home' as const, label: 'Home' },
  { key: 'work', icon: 'work' as const, label: 'Work' },
  { key: 'add', icon: 'add' as const, label: 'Add' },
]

function PlacesRow() {
  return (
    <View style={styles.placesSection}>
      <Text style={styles.sectionLabel}>PLACES</Text>
      <View style={styles.placesRow}>
        {PLACES.map(({ key, icon, label }) => (
          <TouchableOpacity
            key={key}
            style={styles.placesTile}
            activeOpacity={0.75}
            onPress={() => Alert.alert('Coming soon', 'This feature is not yet available.')}
          >
            <View style={styles.placesTileIcon}>
              <MaterialIcons name={icon} size={22} color={Colors.blue} />
            </View>
            <Text style={[Typography.label, { color: Colors.text, marginTop: 4 }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

function SavedRow({
  item,
  onPress,
}: {
  item: SavedJourney
  onPress: () => void
}) {
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
          → {to}  ·  {item.journey.duration} min  ·  {time}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={16} color={Colors.tertiaryText} />
    </TouchableOpacity>
  )
}

function StationResultRow({
  station,
  onPress,
}: {
  station: StationDetail
  onPress: () => void
}) {
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
        <Text style={[Typography.body, { color: Colors.text, fontWeight: '600' }]} numberOfLines={1}>
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
  onSavedJourneyPress: (item: SavedJourney) => void
  onStationPress: (stationName: string) => void
  onLocationSelect: (from: ResolvedLocation | undefined, to: ResolvedLocation) => void
}

export const SearchActionSheet = forwardRef<SearchActionSheetHandle, Props>(
  function SearchActionSheet(
    { savedJourneys, onSavedJourneyPress, onStationPress, onLocationSelect },
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

    // Start translated down so only COLLAPSED_VISIBLE is showing.
    const translateY = useRef(new Animated.Value(SLIDE_OFFSET)).current

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
            (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords
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
        {/* Drag handle */}
        <View style={styles.handle} />

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
            {/* pointerEvents="none" when collapsed so touches pass through to the
                TouchableOpacity on native (editable=false alone doesn't stop touch capture). */}
            <View style={{ flex: 1 }} pointerEvents={expanded ? 'auto' : 'none'}>
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
            {!expanded && (
              <MaterialIcons name="mic" size={16} color={Colors.secondaryText} />
            )}
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
                    <LocationResultRow
                      suggestion={loc}
                      onPress={() => handleLocationSelect(loc)}
                    />
                    <View style={styles.separator} />
                  </View>
                ))}
              </View>
            )}

            {!searching && !hasResults && (
              <View style={styles.emptyState}>
                <MaterialIcons name="search-off" size={36} color={Colors.tertiaryText} />
                <Text
                  style={[Typography.caption, { color: Colors.secondaryText, marginTop: Spacing.sm }]}
                >
                  No results for "{query}"
                </Text>
              </View>
            )}
          </ScrollView>
        ) : (
          <>
            <PlacesRow />

            <View>
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
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.separator,
    alignSelf: 'center',
    marginBottom: Spacing.md,
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
    borderRadius: Radii.small + 4,
    backgroundColor: Colors.searchBg,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 17,
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
    borderRadius: 17,
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
