import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { Input, Spinner, Text, XStack, YStack } from 'tamagui'
import {
  type LocationSuggestion,
  postcodeForSuggestion,
  searchLocations,
} from '@/features/journey/api/geocode'
import { useTheme, Borders, Opacity } from '@/theme'

type LocationInputProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
  /** Called with the postcode resolved from a chosen suggestion, or null when invalidated. */
  onResolved: (postcode: string | null) => void
  /** Pass true when the parent already holds a resolved postcode (e.g. pre-filled from GPS). */
  isResolved?: boolean
  /** Override the input text colour (e.g. blue when showing "Current location"). */
  textColor?: string
  /** Bold the input text — used alongside textColor for the "Current location" display. */
  textBold?: boolean
  /**
   * When provided, shows a "My location" option at the top of the idle dropdown (when the
   * field is focused and empty). The parent owns the GPS logic; this is just the entry point.
   */
  onCurrentLocation?: () => void
  currentLocationLoading?: boolean
}

/**
 * Address field with a postcode-picker dropdown. As the user types a free-text address we
 * fetch matching places (shown with short labels); tapping one keeps the readable address
 * in the box and reports its postcode to the parent via `onResolved` to use behind the
 * scenes. A tick on the right of the box confirms a resolved selection. Typing a postcode
 * or coordinates directly skips the dropdown — those are resolved at submit time.
 */
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
}: LocationInputProps) => {
  const { Colors, Radii } = useTheme()
  const fieldStyle = {
    borderColor: Colors.border,
    backgroundColor: Colors.searchBg,
    fontSize: 15,
  }
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState(isResolvedProp ?? false)
  const [focused, setFocused] = useState(false)

  // Initialised to true when the parent already has a resolved postcode on mount so the
  // initial pre-filled value doesn't trigger a dropdown.
  const skipNextSearch = useRef(isResolvedProp ?? false)

  // Mirrors the resolved state so the search effect can read it without taking it as a dependency
  // (which would re-fire search on resolve). Prevents the search from firing whenever the field is
  // in a resolved state — including when the parent sets "Current location" + postcode in the same
  // render batch. Synced in the effect below, which runs before the search effect on every commit.
  const isResolvedRef = useRef(isResolvedProp ?? false)

  // Keep the ref and the tick in sync when the parent changes the resolved state externally.
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
        const results = await searchLocations(value)
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
    const postcode = await postcodeForSuggestion(suggestion)
    setSearching(false)
    if (!postcode) return
    skipNextSearch.current = true
    setResolved(true)
    onResolved(postcode)
    onChangeText(suggestion.label)
  }

  // Show the "My location" idle dropdown when the field is focused and empty.
  const showLocationShortcut = Boolean(onCurrentLocation) && focused && value.length === 0

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="600" color={Colors.secondaryText}>
        {label}
      </Text>

      <XStack items="center" gap={8}>
        <YStack flex={1} position="relative" justify="center">
          <Input
            value={value}
            onChangeText={handleType}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            selection={focused ? undefined : { start: 0, end: 0 }}
            placeholder="Address, postcode, or lat,long"
            placeholderTextColor="$gray9"
            autoCapitalize="none"
            style={{
              ...fieldStyle,
              paddingRight: 38,
              color: textColor ?? Colors.text,
              fontWeight: textBold ? '700' : '400',
            }}
          />
          {value.length > 0 && (
            <YStack
              position="absolute"
              r={4}
              t={0}
              b={0}
              px="$2"
              justify="center"
              pressStyle={{ opacity: Opacity.subtle }}
              onPress={clear}
              role="button"
              aria-label={`Clear ${label}`}
            >
              <Text fontSize={18} color={Colors.placeholderText}>
                ✕
              </Text>
            </YStack>
          )}
        </YStack>
        <YStack width={20} items="center" justify="center">
          {searching ? (
            <Spinner size="small" color={Colors.secondaryText} />
          ) : resolved ? (
            <Text fontSize={18} fontWeight="700" color={Colors.success}>
              ✓
            </Text>
          ) : null}
        </YStack>
      </XStack>

      {/* Idle dropdown: "My location" shown when focused with an empty field */}
      {showLocationShortcut && (
        <YStack
          style={{
            marginRight: 28,
            borderWidth: Borders.medium,
            borderColor: Colors.border,
            borderRadius: Radii.button,
            backgroundColor: Colors.card,
            overflow: 'hidden',
          }}
        >
          <YStack
            px="$4"
            justify="center"
            pressStyle={currentLocationLoading ? undefined : { background: Colors.searchBg }}
            onPress={currentLocationLoading ? undefined : onCurrentLocation}
            style={{ minHeight: 56 }}
          >
            {currentLocationLoading ? (
              <XStack items="center" gap="$2">
                <Spinner size="small" color={Colors.blue} />
                <Text fontSize={15} color={Colors.secondaryText}>
                  Getting location…
                </Text>
              </XStack>
            ) : (
              <XStack items="center" gap="$2">
                <MaterialIcons name="my-location" size={16} color={Colors.blue} />
                <Text fontSize={15} fontWeight="600" color={Colors.blue}>
                  My location
                </Text>
              </XStack>
            )}
          </YStack>
        </YStack>
      )}

      {/* Suggestions dropdown: shown once the user has typed ≥3 characters */}
      {suggestions.length > 0 && (
        <YStack
          style={{
            marginRight: 28,
            borderWidth: Borders.medium,
            borderColor: Colors.border,
            borderRadius: Radii.button,
            backgroundColor: Colors.card,
            overflow: 'hidden',
          }}
        >
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
        </YStack>
      )}
    </YStack>
  )
}
