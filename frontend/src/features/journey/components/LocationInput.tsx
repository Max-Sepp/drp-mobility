import { useEffect, useRef, useState } from 'react'
import { Input, Spinner, Text, XStack, YStack } from 'tamagui'
import { type LocationSuggestion, postcodeForSuggestion, searchLocations } from '../api/geocode'

const fieldStyle = {
  borderColor: '#d1d5db',
  backgroundColor: '#f9fafb',
  color: '#111827',
  fontSize: 15,
}

type LocationInputProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
  /** Called with the postcode resolved from a chosen suggestion, or null when invalidated. */
  onResolved: (postcode: string | null) => void
}

/**
 * Address field with a postcode-picker dropdown. As the user types a free-text address we
 * fetch matching places (shown with short labels); tapping one keeps the readable address
 * in the box and reports its postcode to the parent via `onResolved` to use behind the
 * scenes. A tick on the right of the box confirms a resolved selection. Typing a postcode
 * or coordinates directly skips the dropdown — those are resolved at submit time.
 */
export const LocationInput = ({ label, value, onChangeText, onResolved }: LocationInputProps) => {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState(false)
  const [focused, setFocused] = useState(false)
  // Skip the search that the value change from a selection would otherwise trigger.
  const skipNextSearch = useRef(false)

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false
      return
    }
    if (value.trim().length < 3) {
      setSuggestions([])
      setSearching(false)
      return
    }
    let active = true
    setSearching(true)
    const timer = setTimeout(async () => {
      const results = await searchLocations(value)
      if (!active) return
      setSuggestions(results)
      setSearching(false)
    }, 400)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [value])

  // User typing invalidates any prior selection.
  function handleType(text: string) {
    setResolved(false)
    onResolved(null)
    onChangeText(text)
  }

  // Empty the field and drop any resolved selection/suggestions. Setting the value to '' lets
  // the search effect tear down the dropdown on its own.
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
    if (!postcode) return // keep the typed text; let the user try a postcode directly
    skipNextSearch.current = true
    setResolved(true)
    onResolved(postcode)
    onChangeText(suggestion.label)
  }

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="600" color="#6b7280">
        {label}
      </Text>

      <XStack items="center" gap={8}>
        <YStack flex={1} position="relative" justify="center">
          <Input
            value={value}
            onChangeText={handleType}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            // When the field loses focus, snap the caret (and scroll) back to the start so the
            // beginning of a long address is visible rather than its tail. Left uncontrolled
            // while focused so typing behaves normally.
            selection={focused ? undefined : { start: 0, end: 0 }}
            placeholder="Address, postcode, or lat,long"
            placeholderTextColor="$gray9"
            autoCapitalize="none"
            style={{ ...fieldStyle, paddingRight: 38 }}
          />
          {value.length > 0 && (
            <YStack
              position="absolute"
              r={4}
              t={0}
              b={0}
              px="$2"
              justify="center"
              pressStyle={{ opacity: 0.5 }}
              onPress={clear}
              accessibilityRole="button"
              accessibilityLabel={`Clear ${label}`}
            >
              <Text fontSize={18} color="#9ca3af">
                ✕
              </Text>
            </YStack>
          )}
        </YStack>
        {/* Status indicator sits outside, to the right of the input. The fixed width keeps the
            input from shifting as the spinner/tick appears and disappears. */}
        <YStack width={20} items="center" justify="center">
          {searching ? (
            <Spinner size="small" color="#6b7280" />
          ) : resolved ? (
            <Text fontSize={18} fontWeight="700" color="#16a34a">
              ✓
            </Text>
          ) : null}
        </YStack>
      </XStack>

      {suggestions.length > 0 && (
        <YStack
          style={{
            // Right-narrow by the status slot (20) + its gap (8) so the dropdown's right edge
            // lines up with the input field rather than the wider row.
            marginRight: 28,
            borderWidth: 1.5,
            borderColor: '#d1d5db',
            borderRadius: 10,
            backgroundColor: 'white',
            overflow: 'hidden',
          }}
        >
          {suggestions.map((suggestion, i) => (
            <YStack
              key={`${suggestion.lat},${suggestion.lon}-${i}`}
              px="$4"
              justify="center"
              pressStyle={{ background: '#f3f4f6' }}
              onPress={() => choose(suggestion)}
              style={{
                minHeight: 56,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: '#e5e7eb',
              }}
            >
              <Text fontSize={15} color="#111827" numberOfLines={1}>
                {suggestion.label}
              </Text>
              {suggestion.postcode && (
                <Text fontSize={13} color="#6b7280">
                  {suggestion.postcode}
                </Text>
              )}
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  )
}
