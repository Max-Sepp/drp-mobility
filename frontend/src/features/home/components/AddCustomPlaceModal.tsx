// Two-step modal for adding a custom place.
// Step 1: search for an address.
// Step 2: confirm auto-filled name, pick an icon, then save.

import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
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
import { Colors, Radii, Shadows, Spacing, Typography } from '@/theme'

type Props = {
  visible: boolean
  onSave: (place: Omit<CustomPlace, 'id'>) => void
  onDismiss: () => void
}

type Step =
  | { type: 'search' }
  | { type: 'details'; suggestion: LocationSuggestion; postcode: string }

const ICONS: { name: keyof typeof MaterialIcons.glyphMap; label: string }[] = [
  { name: 'star', label: 'Star' },
  { name: 'favorite', label: 'Heart' },
  { name: 'local-cafe', label: 'Café' },
  { name: 'fitness-center', label: 'Gym' },
  { name: 'school', label: 'School' },
  { name: 'restaurant', label: 'Food' },
  { name: 'shopping-cart', label: 'Shop' },
  { name: 'local-hospital', label: 'Medical' },
]

export function AddCustomPlaceModal({ visible, onSave, onDismiss }: Props) {
  const insets = useSafeAreaInsets()
  const [step, setStep] = useState<Step>({ type: 'search' })
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<keyof typeof MaterialIcons.glyphMap>('star')
  const [saving, setSaving] = useState(false)
  const nameInputRef = useRef<TextInput>(null)

  useEffect(() => {
    if (!visible) {
      setStep({ type: 'search' })
      setQuery('')
      setSuggestions([])
      setName('')
      setIcon('star')
    }
  }, [visible])

  useEffect(() => {
    if (query.length < 3) {
      setSuggestions([])
      setSearching(false)
      return
    }
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
      // Auto-fill the name from the first part of the suggestion label (before any comma).
      const autoName = suggestion.label.split(',')[0].trim()
      setName(autoName)
      setStep({ type: 'details', suggestion, postcode })
      setTimeout(() => nameInputRef.current?.focus(), 100)
    } finally {
      setResolving(false)
    }
  }

  function handleSave() {
    if (step.type !== 'details') return
    const trimmed = name.trim()
    if (!trimmed) {
      Alert.alert('Name required', 'Please give this place a name.')
      return
    }
    setSaving(true)
    onSave({ name: trimmed, icon, address: step.suggestion.label, postcode: step.postcode })
    setSaving(false)
  }

  const isDetails = step.type === 'details'

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
          {isDetails ? (
            <TouchableOpacity
              onPress={() => setStep({ type: 'search' })}
              style={styles.backBtn}
              activeOpacity={0.7}
            >
              <MaterialIcons name="arrow-back" size={22} color={Colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}
          <Text style={styles.title}>{isDetails ? 'Name this place' : 'Add a place'}</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} activeOpacity={0.7}>
            <MaterialIcons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {isDetails && step.type === 'details' ? (
          // ── Step 2: name + icon + save ────────────────────────────────────
          <View style={styles.detailsBody}>
            {/* Resolved address chip */}
            <View style={styles.addressChip}>
              <MaterialIcons name="place" size={16} color={Colors.secondaryText} />
              <Text style={styles.addressChipText} numberOfLines={2}>
                {step.suggestion.label}
              </Text>
            </View>

            {/* Name input */}
            <Text style={styles.fieldLabel}>Name</Text>
            <View style={styles.nameInputRow}>
              <TextInput
                ref={nameInputRef}
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Gym, Parents, School…"
                placeholderTextColor={Colors.placeholderText}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                maxLength={30}
              />
            </View>

            {/* Icon picker */}
            <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>Icon</Text>
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

            {/* Save button */}
            <TouchableOpacity
              onPress={handleSave}
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              activeOpacity={0.8}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>Save place</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ── Step 1: address search ────────────────────────────────────────
          <>
            <View style={styles.inputRow}>
              <MaterialIcons
                name="search"
                size={18}
                color={Colors.secondaryText}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={styles.input}
                placeholder="Search for an address or postcode…"
                placeholderTextColor={Colors.placeholderText}
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {(searching || resolving) && (
                <ActivityIndicator size="small" color={Colors.secondaryText} />
              )}
            </View>

            <FlatList
              data={suggestions}
              keyExtractor={(_, i) => String(i)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
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
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              ListEmptyComponent={
                query.length >= 3 && !searching ? (
                  <View style={styles.emptyState}>
                    <Text style={[Typography.caption, { color: Colors.secondaryText }]}>
                      {`No results for "${query}"`}
                    </Text>
                  </View>
                ) : query.length > 0 && query.length < 3 ? (
                  <View style={styles.emptyState}>
                    <Text style={[Typography.caption, { color: Colors.secondaryText }]}>
                      Keep typing to search…
                    </Text>
                  </View>
                ) : null
              }
            />
          </>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
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
  title: {
    ...Typography.heading,
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.searchBg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search step
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.searchBg,
    borderRadius: Radii.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    marginBottom: Spacing.lg,
    ...Shadows.card,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
    padding: 0,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  resultIcon: {
    width: 34,
    height: 34,
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
  emptyState: {
    paddingTop: Spacing.xl,
    alignItems: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.separator,
    marginLeft: 50,
  },

  // Details step
  detailsBody: {
    flex: 1,
  },
  addressChip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.searchBg,
    borderRadius: Radii.button,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  addressChipText: {
    ...Typography.body,
    color: Colors.secondaryText,
    flex: 1,
  },
  fieldLabel: {
    ...Typography.label,
    color: Colors.secondaryText,
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  nameInputRow: {
    backgroundColor: Colors.searchBg,
    borderRadius: Radii.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    ...Shadows.card,
  },
  nameInput: {
    fontSize: 16,
    color: Colors.text,
    padding: 0,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  iconOption: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 68,
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
    marginTop: 'auto',
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
})
