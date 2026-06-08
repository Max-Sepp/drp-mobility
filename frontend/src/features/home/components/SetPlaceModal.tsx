// Modal sheet for searching and saving a Home or Work address.
// Mirrors the debounced-search pattern from SearchActionSheet.

import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
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
import { useTheme, Spacing, Typography } from '@/theme'

type Props = {
  visible: boolean
  placeKey: 'home' | 'work'
  onSave: (address: string, postcode: string) => void
  onDismiss: () => void
}

export function SetPlaceModal({ visible, placeKey, onSave, onDismiss }: Props) {
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
        title: {
          ...Typography.heading,
          color: Colors.text,
          flex: 1,
        },
        closeBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
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
          color: Colors.text,
          fontWeight: '600',
        },
        resultSubtitle: {
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
      }),
    [Colors, Radii, Shadows],
  )
  const insets = useSafeAreaInsets()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  const title = placeKey === 'home' ? 'Set Home address' : 'Set Work address'

  useEffect(() => {
    if (!visible) {
      setQuery('')
      setSuggestions([])
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

  async function handleSelect(suggestion: LocationSuggestion) {
    setSaving(true)
    try {
      const postcode = await postcodeForSuggestion(suggestion)
      if (!postcode) {
        Alert.alert(
          'Location error',
          "Couldn't resolve that address. Try a more specific address or a postcode.",
        )
        return
      }
      onSave(suggestion.label, postcode)
    } finally {
      setSaving(false)
    }
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
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} activeOpacity={0.7}>
            <MaterialIcons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search input */}
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
          {searching && <ActivityIndicator size="small" color={Colors.secondaryText} />}
          {saving && <ActivityIndicator size="small" color={Colors.blue} />}
        </View>

        {/* Results */}
        <FlatList
          data={suggestions}
          keyExtractor={(_, i) => String(i)}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => handleSelect(item)}
              style={styles.resultRow}
              activeOpacity={0.7}
              disabled={saving}
            >
              <View style={styles.resultIcon}>
                <MaterialIcons name="place" size={16} color={Colors.secondaryText} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[Typography.body, styles.resultLabel]} numberOfLines={1}>
                  {item.label}
                </Text>
                {item.subtitle ? (
                  <Text style={[Typography.caption, styles.resultSubtitle]} numberOfLines={1}>
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
      </View>
    </Modal>
  )
}

