// Single-screen form for adding a custom place.
// Fields visible from the start: name → location search → icon picker → save.

import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  postcodeForSuggestion,
  searchLocations,
  type LocationSuggestion,
} from '@/features/journey/api/geocode'
import type { CustomPlace } from '@/features/journey/api/savedPlaces'
import { useTheme, Spacing, Typography } from '@/theme'

type Props = {
  visible: boolean
  existingNames?: string[]
  onSave: (place: Omit<CustomPlace, 'id'>) => void
  onDismiss: () => void
}

type ResolvedAddress = { label: string; postcode: string }

const ICONS: { name: keyof typeof MaterialIcons.glyphMap; label: string }[] = [
  { name: 'star', label: 'Star' },
  { name: 'favorite', label: 'Heart' },
  { name: 'home', label: 'Home' },
  { name: 'work', label: 'Work' },
  { name: 'local-cafe', label: 'Café' },
  { name: 'fitness-center', label: 'Gym' },
  { name: 'school', label: 'School' },
  { name: 'restaurant', label: 'Food' },
  { name: 'shopping-cart', label: 'Shop' },
  { name: 'local-hospital', label: 'Medical' },
]

export function AddCustomPlaceModal({ visible, existingNames = [], onSave, onDismiss }: Props) {
  const { Colors, Radii, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: Colors.card,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.lg,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: Spacing.lg,
        },
        headerSpacer: {
          width: 36,
        },
        title: {
          ...Typography.heading,
          color: Colors.text,
          flex: 1,
          textAlign: 'center',
        },
        closeBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        scrollContent: {
          paddingBottom: Spacing.lg,
        },
        fieldLabel: {
          ...Typography.label,
          color: Colors.secondaryText,
          letterSpacing: 0.5,
          marginBottom: Spacing.sm,
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: Colors.searchBg,
          borderRadius: Radii.input,
          paddingHorizontal: Spacing.md,
          paddingVertical: 12,
          ...Shadows.card,
        },
        input: {
          flex: 1,
          fontSize: 15,
          color: Colors.text,
          padding: 0,
        },
        resolvedChip: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          backgroundColor: Colors.searchBg,
          borderRadius: Radii.input,
          paddingHorizontal: Spacing.md,
          paddingVertical: 12,
        },
        resolvedChipText: {
          ...Typography.body,
          color: Colors.text,
          flex: 1,
        },
        suggestionsBox: {
          marginTop: Spacing.xs,
          backgroundColor: Colors.card,
          borderRadius: Radii.button,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: Colors.separator,
          overflow: 'hidden',
        },
        resultRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
        },
        resultIcon: {
          width: 30,
          height: 30,
          borderRadius: Radii.icon,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        resultLabel: {
          ...Typography.body,
          color: Colors.text,
          fontWeight: '600',
        },
        resultSubtitle: {
          ...Typography.caption,
          color: Colors.secondaryText,
        },
        separator: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: Colors.separator,
          marginLeft: 50,
        },
        iconGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Spacing.sm,
        },
        iconOption: {
          alignItems: 'center',
          justifyContent: 'center',
          width: 66,
          paddingVertical: Spacing.sm,
          borderRadius: Radii.button,
          backgroundColor: Colors.searchBg,
          gap: 4,
        },
        iconOptionSelected: {
          backgroundColor: Colors.blue,
        },
        iconLabel: {
          fontSize: 11,
          color: Colors.blue,
          fontWeight: '600',
        },
        iconLabelSelected: {
          color: Colors.card,
        },
        saveBtn: {
          marginTop: Spacing.xl,
          backgroundColor: Colors.text,
          borderRadius: Radii.button,
          height: 52,
          alignItems: 'center',
          justifyContent: 'center',
        },
        saveBtnText: {
          color: Colors.card,
          fontSize: 16,
          fontWeight: '700',
        },
      }),
    [Colors, Radii, Shadows],
  )
  const insets = useSafeAreaInsets()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<keyof typeof MaterialIcons.glyphMap>('star')
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const visibleSuggestions = query.length >= 3 ? suggestions : []
  const isSearching = query.length >= 3 && searching
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<ResolvedAddress | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName('')
      setIcon('star')
      setQuery('')
      setResolved(null)
    }
  }, [visible])

  useEffect(() => {
    if (query.length < 3) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true)
    const timer = setTimeout(async () => {
      const results = await searchLocations(query)
      setSuggestions(results)
      setSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [query])

  async function handleSelectSuggestion(suggestion: LocationSuggestion) {
    setResolving(true)
    try {
      const postcode = await postcodeForSuggestion(suggestion)
      if (!postcode) {
        Alert.alert(
          'Location error',
          "Couldn't resolve that address. Try a more specific address or a postcode.",
        )
        return
      }
      setResolved({ label: suggestion.label, postcode })
      setSuggestions([])
      setQuery('')
      // Auto-fill name from address if the user hasn't typed one yet.
      if (!name.trim()) {
        setName(suggestion.label.split(',')[0].trim())
      }
    } finally {
      setResolving(false)
    }
  }

  function handleSave() {
    const trimmed = name.trim()
    if (!trimmed) {
      Alert.alert('Name required', 'Please give this place a name.')
      return
    }
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert(
        'Name already used',
        'You already have a place with that name. Please choose a different one.',
      )
      return
    }
    if (!resolved) {
      Alert.alert('Location required', 'Please search for and select a location.')
      return
    }
    setSaving(true)
    onSave({ name: trimmed, icon, address: resolved.label, postcode: resolved.postcode })
    setSaving(false)
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onDismiss}
    >
      <View style={[styles.container, { paddingBottom: insets.bottom + Spacing.lg }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text style={styles.title}>Add a place</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} activeOpacity={0.7}>
            <MaterialIcons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Name */}
          <Text style={styles.fieldLabel}>NAME</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Gym, Parents, School…"
              placeholderTextColor={Colors.placeholderText}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              maxLength={30}
            />
          </View>

          {/* Location */}
          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>LOCATION</Text>
          {resolved ? (
            <TouchableOpacity
              onPress={() => setResolved(null)}
              style={styles.resolvedChip}
              activeOpacity={0.7}
            >
              <MaterialIcons name="place" size={16} color={Colors.blue} />
              <Text style={styles.resolvedChipText} numberOfLines={2}>
                {resolved.label}
              </Text>
              <MaterialIcons name="close" size={16} color={Colors.secondaryText} />
            </TouchableOpacity>
          ) : (
            <View style={styles.inputRow}>
              <MaterialIcons
                name="search"
                size={16}
                color={Colors.secondaryText}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder="Search for an address or postcode…"
                placeholderTextColor={Colors.placeholderText}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {(isSearching || resolving) && (
                <ActivityIndicator size="small" color={Colors.secondaryText} />
              )}
            </View>
          )}

          {/* Inline address suggestions */}
          {visibleSuggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              {visibleSuggestions.map((item, i) => (
                <View key={i}>
                  <TouchableOpacity
                    onPress={() => handleSelectSuggestion(item)}
                    style={styles.resultRow}
                    activeOpacity={0.7}
                    disabled={resolving}
                  >
                    <View style={styles.resultIcon}>
                      <MaterialIcons name="place" size={16} color={Colors.secondaryText} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultLabel} numberOfLines={1}>
                        {item.label}
                      </Text>
                      {item.subtitle ? (
                        <Text style={styles.resultSubtitle} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <MaterialIcons name="chevron-right" size={16} color={Colors.tertiaryText} />
                  </TouchableOpacity>
                  {i < visibleSuggestions.length - 1 && <View style={styles.separator} />}
                </View>
              ))}
            </View>
          )}

          {/* Icon */}
          <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>ICON</Text>
          <View style={styles.iconGrid}>
            {ICONS.map((item) => {
              const selected = icon === item.name
              return (
                <TouchableOpacity
                  key={item.name}
                  onPress={() => setIcon(item.name)}
                  style={[styles.iconOption, selected && styles.iconOptionSelected]}
                  activeOpacity={0.7}
                >
                  <MaterialIcons
                    name={item.name}
                    size={22}
                    color={selected ? Colors.card : Colors.blue}
                  />
                  <Text style={[styles.iconLabel, selected && styles.iconLabelSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Save */}
          <TouchableOpacity
            onPress={handleSave}
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            activeOpacity={0.8}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>Save place</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}
