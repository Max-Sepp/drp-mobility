// Bottom sheet for MapHomeScreen — three snap positions:
//   collapsed  → search bar only (just peeking at the bottom)
//   mid        → ~50% screen height, shows Places + Saved Journeys
//   full       → ~88% screen height, search active
//
// Dragging works from the handle, search row, or anywhere on the body content
// (when not at full snap the body ScrollView has scrollEnabled=false so no conflict).
// Tapping the search bar snaps to full and immediately focuses the input.

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
  Pressable,
  TouchableOpacity,
  View,
} from 'react-native'
import type { CustomPlace, SavedPlaces } from '@/features/journey/api/savedPlaces'
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
import { Colors, Overlays, Radii, Shadows, Spacing, Typography } from '@/theme'

// useNativeDriver is not available on web (no native animation module).
const USE_NATIVE_DRIVER = Platform.OS !== 'web'

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const SCREEN_H = Dimensions.get('window').height
// Total card height — generous enough for full-snap content.
const SHEET_H = SCREEN_H * 0.88
// Mid snap: bottom 50% of screen visible.
const MID_H = SCREEN_H * 0.5

// translateY values — sheet is bottom-anchored; positive Y pushes it down.
// SNAP_COLLAPSED is computed inside the component (depends on bottom inset).
const SNAP_MID = SHEET_H - MID_H
const SNAP_FULL = 0

type SnapState = 'collapsed' | 'mid' | 'full'

function computeTarget(
  landing: number,
  vy: number,
  current: SnapState,
  snapCollapsed: number,
): SnapState {
  // Fast fling overrides distance-based snap.
  if (vy < -0.8) return current === 'collapsed' ? 'mid' : 'full'
  if (vy > 0.8) return current === 'full' ? 'mid' : 'collapsed'
  // Otherwise snap to nearest.
  const dFull = Math.abs(landing - SNAP_FULL)
  const dMid = Math.abs(landing - SNAP_MID)
  const dCollapsed = Math.abs(landing - snapCollapsed)
  const minDist = Math.min(dFull, dMid, dCollapsed)
  if (minDist === dFull) return 'full'
  if (minDist === dMid) return 'mid'
  return 'collapsed'
}

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

  const tileCount = NAMED_PLACES.length + savedPlaces.custom.length + 1
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
              accessibilityHint={
                saved ? 'Tap to plan journey. Long press to edit or remove.' : 'Tap to set your address'
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
          <View
            style={[
              styles.scrollbarThumb,
              { width: thumbWidth, transform: [{ translateX: thumbLeft }] },
            ]}
          />
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

    // Collapsed: just handle zone + search bar + bottom safe area.
    // ~88px of content + bottom inset.
    const SNAP_COLLAPSED = SHEET_H - (88 + insets.bottom)

    const [snap, setSnap] = useState<SnapState>('mid')
    const [query, setQuery] = useState('')
    const [stationResults, setStationResults] = useState<StationDetail[]>([])
    const [locationResults, setLocationResults] = useState<LocationSuggestion[]>([])
    const [searching, setSearching] = useState(false)
    const [gpsLoading, setGpsLoading] = useState(false)

    const inputRef = useRef<TextInput>(null)
    const snapRef = useRef<SnapState>('mid')
    // Keeps snap geometry up-to-date for PanResponder closures (created once).
    const snapPointsRef = useRef({ collapsed: SNAP_COLLAPSED, mid: SNAP_MID, full: SNAP_FULL })
    snapPointsRef.current = { collapsed: SNAP_COLLAPSED, mid: SNAP_MID, full: SNAP_FULL }
    // Forward to PanResponder closures so they always call the latest snapTo.
    const snapToRef = useRef<(target: SnapState, withFocus?: boolean) => void>(() => {})
    // Shared drag origin across both pan responders.
    const dragStartRef = useRef(SNAP_MID)

    const { stations } = useStations()
    const cachedCoords = useAppLocation()

    const [translateY] = useState(() => new Animated.Value(SNAP_MID))

    // ── Pan responders ────────────────────────────────────────────────────
    // headerPanHandlers: always active — on the drag handle and search row.
    // contentPanHandlers: only claims when not at full snap, so the ScrollView
    //   can scroll normally when the sheet is fully open.

    const [headerPanHandlers] = useState(() =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, g) =>
          Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: () => {
          translateY.stopAnimation((val) => {
            dragStartRef.current = val
          })
        },
        onPanResponderMove: (_evt, g) => {
          const max = snapPointsRef.current.collapsed
          translateY.setValue(Math.max(0, Math.min(max, dragStartRef.current + g.dy)))
        },
        onPanResponderRelease: (_evt, g) => {
          const { collapsed } = snapPointsRef.current
          const target = computeTarget(
            dragStartRef.current + g.dy,
            g.vy,
            snapRef.current,
            collapsed,
          )
          snapToRef.current(target)
        },
      }).panHandlers,
    )

    const [contentPanHandlers] = useState(() =>
      PanResponder.create({
        // Capture phase fires parent-before-child, so the body View claims the drag
        // before the ScrollView inside can hold it. Only active when not at full snap
        // (where the ScrollView should scroll normally). Pure taps are unaffected
        // because move handlers only fire once the finger actually moves.
        onMoveShouldSetPanResponder: (_evt, g) => {
          if (snapRef.current === 'full') return false
          return Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx)
        },
        onMoveShouldSetPanResponderCapture: (_evt, g) => {
          if (snapRef.current === 'full') return false
          return Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx)
        },
        onPanResponderGrant: () => {
          translateY.stopAnimation((val) => {
            dragStartRef.current = val
          })
        },
        onPanResponderMove: (_evt, g) => {
          const max = snapPointsRef.current.collapsed
          translateY.setValue(Math.max(0, Math.min(max, dragStartRef.current + g.dy)))
        },
        onPanResponderRelease: (_evt, g) => {
          const { collapsed } = snapPointsRef.current
          const target = computeTarget(
            dragStartRef.current + g.dy,
            g.vy,
            snapRef.current,
            collapsed,
          )
          snapToRef.current(target)
        },
      }).panHandlers,
    )

    // ── Snap action ───────────────────────────────────────────────────────

    const snapTo = useCallback(
      (target: SnapState, withFocus = false) => {
        setSnap(target)
        snapRef.current = target

        if (target !== 'full') {
          Keyboard.dismiss()
          setQuery('')
        }

        if (withFocus && target === 'full') {
          // Wait one frame so React re-renders with editable=true before focusing.
          setTimeout(() => inputRef.current?.focus(), 50)
        }

        Animated.spring(translateY, {
          toValue: snapPointsRef.current[target],
          stiffness: 160,
          damping: 24,
          mass: 0.9,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start()
      },
      [translateY],
    )

    snapToRef.current = snapTo

    useImperativeHandle(ref, () => ({ expand: () => snapToRef.current('mid') }), [])

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

        snapTo('collapsed')
        onLocationSelect(from, to)
      } finally {
        setGpsLoading(false)
      }
    }

    // ── Render ────────────────────────────────────────────────────────────

    const atFull = snap === 'full'
    const hasQuery = query.length >= 3
    const hasResults = stationResults.length > 0 || locationResults.length > 0

    // Backdrop opacity interpolated from translateY so it tracks the drag in real time.
    // Full snap (translateY=0) → fully opaque; mid snap (translateY=SNAP_MID) → transparent.
    const backdropOpacity = translateY.interpolate({
      inputRange: [SNAP_FULL, SNAP_MID],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    })

    return (
      <>
        <Animated.View
          pointerEvents={atFull ? 'auto' : 'none'}
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={() => snapTo('mid')} />
        </Animated.View>
        <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: insets.bottom + Spacing.md,
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Drag handle — always draggable */}
        <View {...headerPanHandlers} style={styles.handleZone}>
          <View style={styles.handle} />
        </View>

        {/* Search bar — also always draggable; tap opens full snap + focuses */}
        <View {...headerPanHandlers} style={styles.searchRow}>
          <TouchableOpacity
            style={[styles.searchPill, atFull && styles.searchPillExpanded]}
            onPress={!atFull ? () => snapTo('full', true) : undefined}
            activeOpacity={atFull ? 1 : 0.8}
          >
            <MaterialIcons
              name="search"
              size={18}
              color={Colors.secondaryText}
              style={{ marginRight: 6 }}
            />
            {/* pointerEvents="none" when not at full so taps pass through to TouchableOpacity */}
            <View style={{ flex: 1, pointerEvents: atFull ? 'auto' : 'none' }}>
              <TextInput
                ref={inputRef}
                style={styles.searchInput}
                placeholder="Where to?"
                placeholderTextColor={Colors.placeholderText}
                editable={atFull}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                value={query}
                onChangeText={setQuery}
              />
            </View>
            {!atFull && <MaterialIcons name="mic" size={16} color={Colors.secondaryText} />}
            {atFull && searching && (
              <ActivityIndicator size="small" color={Colors.secondaryText} />
            )}
          </TouchableOpacity>

        </View>

        {/* Body — always mounted so it slides off-screen rather than popping out */}
        <View {...contentPanHandlers} style={styles.bodyWrapper}>
            {hasQuery ? (
              <ScrollView
                style={styles.resultsScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                scrollEnabled={atFull}
              >
                {gpsLoading && (
                  <View style={styles.gpsLoadingRow}>
                    <ActivityIndicator size="small" color={Colors.blue} />
                    <Text
                      style={[Typography.caption, { color: Colors.secondaryText, marginLeft: 8 }]}
                    >
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
                            snapTo('collapsed')
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
              <ScrollView
                showsVerticalScrollIndicator={false}
                scrollEnabled={atFull}
                keyboardShouldPersistTaps="handled"
              >
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
              </ScrollView>
            )}
        </View>
        </Animated.View>
      </>
    )
  },
)

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: Overlays.backdrop,
  },
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
  // Body wrapper — contentPanHandlers spread here so anywhere on the body is draggable
  // when not at full snap.
  bodyWrapper: {
    flex: 1,
  },

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
