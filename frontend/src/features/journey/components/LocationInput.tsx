import { useEffect, useRef, useState } from 'react'
import { Input, Text, XStack, YStack } from 'tamagui'
import { type LocationSuggestion, postcodeForSuggestion, searchLocations } from '../api/geocode'

const fieldStyle = { borderColor: '#d1d5db', backgroundColor: '#f9fafb', color: '#111827', fontSize: 15 }

type LocationInputProps = {
  label: string
  value: string
  onChangeText: (text: string) => void
}

/**
 * Address field with a postcode-picker dropdown: as the user types a free-text address we
 * fetch matching places and list them; tapping one fills the field with that place's
 * postcode (and confirms the place name below). Typing a postcode or coordinates directly
 * skips the dropdown — those are used as-is.
 */
export const LocationInput = ({ label, value, onChangeText }: LocationInputProps) => {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
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
    setSelectedLabel(null)
    onChangeText(text)
  }

  async function choose(suggestion: LocationSuggestion) {
    setSuggestions([])
    const postcode = await postcodeForSuggestion(suggestion)
    skipNextSearch.current = true
    if (postcode) {
      setSelectedLabel(suggestion.label)
      onChangeText(postcode)
    } else {
      // No postcode found — keep the typed text and let the user try a postcode directly.
      skipNextSearch.current = false
    }
  }

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="600" color="#6b7280">{label}</Text>
      <Input
        value={value}
        onChangeText={handleType}
        placeholder="Address, postcode, or lat,long"
        placeholderTextColor="$gray9"
        autoCapitalize="none"
        style={fieldStyle}
      />

      {searching && <Text fontSize={13} color="#6b7280">Searching…</Text>}

      {selectedLabel && (
        <XStack gap="$1.5" items="center">
          <Text fontSize={13} color="#16a34a">✓</Text>
          <Text fontSize={13} color="#374151" flex={1} numberOfLines={2}>{selectedLabel}</Text>
        </XStack>
      )}

      {suggestions.length > 0 && (
        <YStack style={{ borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: 'white', overflow: 'hidden' }}>
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
              <Text fontSize={15} color="#111827" numberOfLines={2}>{suggestion.label}</Text>
              {suggestion.postcode && (
                <Text fontSize={13} color="#6b7280">{suggestion.postcode}</Text>
              )}
            </YStack>
          ))}
        </YStack>
      )}
    </YStack>
  )
}
