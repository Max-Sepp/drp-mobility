import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { Keyboard, Platform, View } from 'react-native'
import { Input, Spinner, Text, YStack } from 'tamagui'
import {
  type LocationSuggestion,
  postcodeForSuggestion,
  resolveToPostcode,
  searchLocations,
} from '@/features/journey/api/geocode'
import {
  addRecentLocation,
  getRecentLocations,
  type RecentLocation,
} from '@/features/journey/api/recentLocations'
import { type StationDetail } from '@/features/stations'
import { fuzzyScore } from '@/lib/fuzzy'
import { alertOffline, isOfflineError } from '@/lib/offline'
import { useTheme, Borders, Opacity } from '@/theme'

export type PlaceShortcut = {
  label: string
  icon: string
  postcode: string
}

type LocationInputProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
  onResolved: (postcode: string | null) => void
  /** Called when a suggestion, station, or saved place is selected; use this instead of onChangeText to avoid clearing the postcode on programmatic text updates. `tflId` is set only for station selections (preferred over the postcode as the TfL query). */
  onSelect?: (label: string, postcode: string, tflId?: string) => void
  isResolved?: boolean
  textColor?: string
  textBold?: boolean
  onCurrentLocation?: () => void
  currentLocationLoading?: boolean
  savedPlaceShortcuts?: PlaceShortcut[]
  /** Station list to fuzzy-match against, so the dropdown can offer stations alongside addresses. */
  stations?: StationDetail[]
}

export const LocationInput = ({
  label,
  value,
  onChangeText,
  onResolved,
  onSelect,
  isResolved: isResolvedProp,
  textColor,
  textBold,
  onCurrentLocation,
  currentLocationLoading,
  savedPlaceShortcuts,
  stations,
}: LocationInputProps) => {
  const { Colors, Radii } = useTheme()
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [stationSuggestions, setStationSuggestions] = useState<StationDetail[]>([])
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState(isResolvedProp ?? false)
  const [focused, setFocused] = useState(false)
  const [recents, setRecents] = useState<RecentLocation[]>([])
  // Measured height of the input box, used to anchor the floating dropdown below it.
  const [inputH, setInputH] = useState(44)

  const skipNextSearch = useRef(isResolvedProp ?? false)
  const isResolvedRef = useRef(isResolvedProp ?? false)
  // Read stations through a ref so the search debounce depends only on `value` — `stations` is a
  // fresh `[]` on every render until the list loads, which would otherwise restart the debounce
  // endlessly and leave the spinner stuck on "searching".
  const stationsRef = useRef(stations)
  useEffect(() => {
    stationsRef.current = stations
  }, [stations])

  useEffect(() => {
    isResolvedRef.current = isResolvedProp ?? false
    if (isResolvedProp !== undefined) setResolved(isResolvedProp)
  }, [isResolvedProp])

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false
      return
    }
    if (isResolvedRef.current) return

    let active = true
    const tooShort = value.trim().length < 3
    const timer = setTimeout(
      async () => {
        if (tooShort) {
          setSuggestions([])
          setStationSuggestions([])
          setSearching(false)
          return
        }
        // Fuzzy-match stations locally (instant) and show the top 2 above the address results.
        const matchedStations = (stationsRef.current ?? [])
          .map((s) => ({ s, score: fuzzyScore(value, s.name) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)
          .map((x) => x.s)
        setStationSuggestions(matchedStations)
        setSearching(true)
        let results: LocationSuggestion[] = []
        try {
          results = await searchLocations(value)
        } catch {
          // Network error — show no suggestions rather than crashing
        }
        if (!active) return
        setSuggestions(results)
        setSearching(false)
      },
      tooShort ? 0 : 400,
    )
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [value])

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const sub = Keyboard.addListener(event, () => {
      setFocused(false)
      setSuggestions([])
      setStationSuggestions([])
    })
    return () => sub.remove()
  }, [])

  function handleType(text: string) {
    if (text.includes('\n')) return
    setResolved(false)
    onResolved(null)
    onChangeText(text)
  }

  function clear() {
    setResolved(false)
    setSuggestions([])
    setStationSuggestions([])
    onResolved(null)
    onChangeText('')
  }

  async function choose(suggestion: LocationSuggestion) {
    Keyboard.dismiss()
    setSuggestions([])
    setStationSuggestions([])
    setSearching(true)
    let postcode: string | null = null
    try {
      postcode = await postcodeForSuggestion(suggestion)
    } catch (err) {
      // Tapping a suggestion with no connection would otherwise do nothing — tell the user why.
      if (isOfflineError(err)) alertOffline('find that place')
    }
    setSearching(false)
    if (!postcode) return
    addRecentLocation(suggestion.label, postcode)
    skipNextSearch.current = true
    setResolved(true)
    if (onSelect) {
      onSelect(suggestion.label, postcode)
    } else {
      onResolved(postcode)
      onChangeText(suggestion.label)
    }
  }

  async function chooseStation(station: StationDetail) {
    Keyboard.dismiss()
    setSuggestions([])
    setStationSuggestions([])
    setSearching(true)
    // Resolve the station's coordinates to a postcode as a TfL-query fallback; the tfl_id is
    // preferred (see `tflQuery`) so the journey ends at the station rather than a nearby postcode.
    let postcode: string | null = null
    try {
      if (station.latitude != null && station.longitude != null) {
        const result = await resolveToPostcode(`${station.latitude},${station.longitude}`)
        if (!('error' in result)) postcode = result.postcode
      }
    } catch (err) {
      if (isOfflineError(err)) alertOffline('find that station')
    }
    setSearching(false)
    if (!postcode) return
    addRecentLocation(station.name, postcode)
    skipNextSearch.current = true
    setResolved(true)
    if (onSelect) {
      onSelect(station.name, postcode, station.tfl_id ?? undefined)
    } else {
      onResolved(postcode)
      onChangeText(station.name)
    }
  }

  function chooseRecent(recent: RecentLocation) {
    Keyboard.dismiss()
    setSuggestions([])
    skipNextSearch.current = true
    setResolved(true)
    addRecentLocation(recent.label, recent.postcode)
    if (onSelect) {
      onSelect(recent.label, recent.postcode!)
    } else {
      onResolved(recent.postcode!)
      onChangeText(recent.label)
    }
  }

  function chooseSavedPlace(place: PlaceShortcut) {
    Keyboard.dismiss()
    setSuggestions([])
    skipNextSearch.current = true
    setResolved(true)
    if (onSelect) {
      onSelect(place.label, place.postcode)
    } else {
      onResolved(place.postcode)
      onChangeText(place.label)
    }
  }

  const showLocationShortcut = Boolean(onCurrentLocation) && focused && value.length === 0
  const showSavedShortcuts = focused && value.length === 0 && (savedPlaceShortcuts?.length ?? 0) > 0
  const showRecents = focused && value.length === 0 && recents.length > 0
  const matchedSavedPlaces =
    focused && value.length > 0 && !resolved && (savedPlaceShortcuts?.length ?? 0) > 0
      ? savedPlaceShortcuts!.filter((p) => p.label.toLowerCase().includes(value.toLowerCase()))
      : []
  const showDropdown =
    showLocationShortcut ||
    showSavedShortcuts ||
    showRecents ||
    matchedSavedPlaces.length > 0 ||
    stationSuggestions.length > 0 ||
    suggestions.length > 0

  // Right-side overlay inside the input: spinner → resolved tick → clear button → nothing.
  const showTick = resolved && !focused && !searching
  const showClear = !searching && !showTick && value.length > 0

  return (
    <YStack gap="$1.5" style={{ zIndex: showDropdown ? 10 : 0 }}>
      <Text fontSize={14} fontWeight="600" color={Colors.secondaryText}>
        {label}
      </Text>

      {/* Relative container anchors the floating dropdown */}
      <View style={{ position: 'relative' }}>
        {/* Input with right-side overlay (spinner / tick / clear) */}
        <YStack
          position="relative"
          justify="center"
          onLayout={(e) => setInputH(e.nativeEvent.layout.height)}
        >
          <Input
            value={value}
            onChangeText={handleType}
            onFocus={() => {
              setFocused(true)
              getRecentLocations().then((r) => setRecents(r.filter((x) => x.postcode !== null)))
            }}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onSubmitEditing={() => {
              if (matchedSavedPlaces.length > 0) chooseSavedPlace(matchedSavedPlaces[0])
              else if (stationSuggestions.length > 0) chooseStation(stationSuggestions[0])
              else if (suggestions.length > 0) choose(suggestions[0])
            }}
            selection={focused ? undefined : { start: 0, end: 0 }}
            placeholder="Address, postcode, or lat,long"
            placeholderTextColor="$gray9"
            autoCapitalize="none"
            returnKeyType="search"
            style={{
              borderColor: Colors.border,
              backgroundColor: Colors.searchBg,
              fontSize: 15,
              paddingRight: 38,
              color: textColor ?? Colors.text,
              fontWeight: textBold ? '700' : '400',
            }}
          />
          {/* Overlay sits at the right of the input field */}
          <YStack
            position="absolute"
            r={4}
            t={0}
            b={0}
            px="$2"
            justify="center"
            pressStyle={showClear ? { opacity: Opacity.subtle } : undefined}
            onPress={showClear ? clear : undefined}
            role={showClear ? 'button' : undefined}
            aria-label={showClear ? `Clear ${label}` : undefined}
          >
            {searching ? (
              <Spinner size="small" color={Colors.secondaryText} />
            ) : showTick ? (
              <Text fontSize={16} fontWeight="700" color={Colors.success}>
                ✓
              </Text>
            ) : showClear ? (
              <Text fontSize={18} color={Colors.placeholderText}>
                ✕
              </Text>
            ) : null}
          </YStack>
        </YStack>

        {/* Floating dropdown — absolutely positioned so it overlays content below */}
        {showDropdown && (
          <View
            style={{
              position: 'absolute',
              top: inputH + 4,
              left: 0,
              right: 0,
              zIndex: 100,
              borderWidth: Borders.medium,
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
            {showLocationShortcut && (
              <YStack
                px="$4"
                justify="center"
                pressStyle={currentLocationLoading ? undefined : { background: Colors.searchBg }}
                onPress={currentLocationLoading ? undefined : onCurrentLocation}
                style={{ minHeight: 56 }}
              >
                {currentLocationLoading ? (
                  <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Spinner size="small" color={Colors.blue} />
                    <Text fontSize={15} color={Colors.secondaryText}>
                      Getting location…
                    </Text>
                  </YStack>
                ) : (
                  <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="my-location" size={16} color={Colors.blue} />
                    <Text fontSize={15} fontWeight="600" color={Colors.blue}>
                      My location
                    </Text>
                  </YStack>
                )}
              </YStack>
            )}

            {showSavedShortcuts &&
              savedPlaceShortcuts!.map((place, i) => (
                <YStack
                  key={place.postcode + place.label}
                  px="$4"
                  justify="center"
                  pressStyle={{ background: Colors.searchBg }}
                  onPress={() => chooseSavedPlace(place)}
                  style={{
                    minHeight: 56,
                    borderTopWidth: i === 0 && !showLocationShortcut ? 0 : Borders.thin,
                    borderTopColor: Colors.border,
                  }}
                >
                  <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons
                      name={place.icon as keyof typeof MaterialIcons.glyphMap}
                      size={16}
                      color={Colors.secondaryText}
                    />
                    <Text fontSize={15} fontWeight="600" color={Colors.text}>
                      {place.label}
                    </Text>
                  </YStack>
                </YStack>
              ))}

            {showRecents &&
              recents.slice(0, 5).map((recent, i) => (
                <YStack
                  key={recent.label + i}
                  px="$4"
                  justify="center"
                  pressStyle={{ background: Colors.searchBg }}
                  onPress={() => chooseRecent(recent)}
                  style={{
                    minHeight: 56,
                    borderTopWidth:
                      i === 0 && !showLocationShortcut && !showSavedShortcuts ? 0 : Borders.thin,
                    borderTopColor: Colors.border,
                  }}
                >
                  <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialIcons name="history" size={16} color={Colors.secondaryText} />
                    <Text fontSize={15} fontWeight="600" color={Colors.text}>
                      {recent.label}
                    </Text>
                  </YStack>
                </YStack>
              ))}

            {matchedSavedPlaces.map((place, i) => (
              <YStack
                key={place.postcode + place.label}
                px="$4"
                justify="center"
                pressStyle={{ background: Colors.searchBg }}
                onPress={() => chooseSavedPlace(place)}
                style={{
                  minHeight: 56,
                  borderTopWidth: i === 0 ? 0 : Borders.thin,
                  borderTopColor: Colors.border,
                }}
              >
                <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons
                    name={place.icon as keyof typeof MaterialIcons.glyphMap}
                    size={16}
                    color={Colors.secondaryText}
                  />
                  <Text fontSize={15} fontWeight="600" color={Colors.text}>
                    {place.label}
                  </Text>
                </YStack>
              </YStack>
            ))}

            {/* Stations come first. Same row shape as addresses, but a train icon (lightly
                tinted, not the bold blue of the home search) so the two types blend. */}
            {stationSuggestions.map((station, i) => (
              <YStack
                key={`station-${station.id}`}
                px="$4"
                justify="center"
                pressStyle={{ background: Colors.searchBg }}
                onPress={() => chooseStation(station)}
                style={{
                  minHeight: 56,
                  borderTopWidth: i === 0 && matchedSavedPlaces.length === 0 ? 0 : Borders.thin,
                  borderTopColor: Colors.border,
                }}
              >
                <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="train" size={16} color={Colors.blue} />
                  <YStack flex={1}>
                    <Text fontSize={15} fontWeight="600" color={Colors.text} numberOfLines={1}>
                      {station.name}
                    </Text>
                    <Text fontSize={13} color={Colors.secondaryText}>
                      Station
                    </Text>
                  </YStack>
                </YStack>
              </YStack>
            ))}

            {suggestions.map((suggestion, i) => (
              <YStack
                key={`${suggestion.lat},${suggestion.lon}-${i}`}
                px="$4"
                justify="center"
                pressStyle={{ background: Colors.searchBg }}
                onPress={() => choose(suggestion)}
                style={{
                  minHeight: 56,
                  borderTopWidth:
                    i === 0 && matchedSavedPlaces.length === 0 && stationSuggestions.length === 0
                      ? 0
                      : Borders.thin,
                  borderTopColor: Colors.border,
                }}
              >
                <YStack gap="$2" style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="place" size={16} color={Colors.secondaryText} />
                  <YStack flex={1}>
                    <Text fontSize={15} fontWeight="600" color={Colors.text} numberOfLines={1}>
                      {suggestion.label}
                    </Text>
                    {suggestion.subtitle ? (
                      <Text fontSize={13} color={Colors.secondaryText} numberOfLines={1}>
                        {suggestion.subtitle}
                      </Text>
                    ) : null}
                  </YStack>
                </YStack>
              </YStack>
            ))}
          </View>
        )}
      </View>
    </YStack>
  )
}
