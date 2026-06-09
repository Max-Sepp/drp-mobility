import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { Input, Spinner, Text, YStack } from 'tamagui'
import {
  type LocationSuggestion,
  postcodeForSuggestion,
  searchLocations,
} from '@/features/journey/api/geocode'
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
  isResolved?: boolean
  textColor?: string
  textBold?: boolean
  onCurrentLocation?: () => void
  currentLocationLoading?: boolean
  savedPlaceShortcuts?: PlaceShortcut[]
}

export const LocationInput = ({
  label,
  value,
  onChangeText,
  onResolved,
  isResolved: isResolvedProp,
  textColor,
  textBold,
  onCurrentLocation,
  currentLocationLoading,
  savedPlaceShortcuts,
}: LocationInputProps) => {
  const { Colors, Radii } = useTheme()
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState(isResolvedProp ?? false)
  const [focused, setFocused] = useState(false)
  // Measured height of the input box, used to anchor the floating dropdown below it.
  const [inputH, setInputH] = useState(44)

  const skipNextSearch = useRef(isResolvedProp ?? false)
  const isResolvedRef = useRef(isResolvedProp ?? false)

  useEffect(() => {
    isResolvedRef.current = isResolvedProp ?? false
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          setSearching(false)
          return
        }
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

  function handleType(text: string) {
    if (text.includes('\n')) return
    setResolved(false)
    onResolved(null)
    onChangeText(text)
  }

  function clear() {
    setResolved(false)
    setSuggestions([])
    onResolved(null)
    onChangeText('')
  }

  async function choose(suggestion: LocationSuggestion) {
    setSuggestions([])
    setSearching(true)
    let postcode: string | null = null
    try {
      postcode = await postcodeForSuggestion(suggestion)
    } catch {
      // Network error — leave postcode null
    }
    setSearching(false)
    if (!postcode) return
    skipNextSearch.current = true
    setResolved(true)
    onResolved(postcode)
    onChangeText(suggestion.label)
  }

  function chooseSavedPlace(place: PlaceShortcut) {
    setSuggestions([])
    skipNextSearch.current = true
    setResolved(true)
    onResolved(place.postcode)
    onChangeText(place.label)
  }

  const showLocationShortcut = Boolean(onCurrentLocation) && focused && value.length === 0
  const showSavedShortcuts = focused && value.length === 0 && (savedPlaceShortcuts?.length ?? 0) > 0
  const showDropdown = showLocationShortcut || showSavedShortcuts || suggestions.length > 0

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
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onSubmitEditing={() => { if (suggestions.length > 0) choose(suggestions[0]) }}
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

            {suggestions.map((suggestion, i) => (
              <YStack
                key={`${suggestion.lat},${suggestion.lon}-${i}`}
                px="$4"
                justify="center"
                pressStyle={{ background: Colors.searchBg }}
                onPress={() => choose(suggestion)}
                style={{
                  minHeight: 56,
                  borderTopWidth: i === 0 ? 0 : Borders.thin,
                  borderTopColor: Colors.border,
                }}
              >
                <Text fontSize={15} fontWeight="600" color={Colors.text} numberOfLines={1}>
                  {suggestion.label}
                </Text>
                {suggestion.subtitle ? (
                  <Text fontSize={13} color={Colors.secondaryText} numberOfLines={1}>
                    {suggestion.subtitle}
                  </Text>
                ) : null}
              </YStack>
            ))}
          </View>
        )}
      </View>
    </YStack>
  )
}
