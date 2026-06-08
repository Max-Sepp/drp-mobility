import { MaterialIcons } from '@expo/vector-icons'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useState } from 'react'
import { ActionSheetIOS, Alert, Modal, Platform, TouchableOpacity, View } from 'react-native'
import { Text, XStack } from 'tamagui'
import { formatDepart } from '@/features/journey/components/LeaveAtField'
import { useTheme, Borders, Opacity } from '@/theme'

// ---------------------------------------------------------------------------
// Generic filter pill — step-free, journey preference, etc.
// ---------------------------------------------------------------------------

type FilterPillProps = {
  label: string
  options: { label: string; value: string | null }[]
  value: string | null
  onSelect: (v: string | null) => void
}

export function FilterPill({ label, options, value, onSelect }: FilterPillProps) {
  const { Colors, Radii } = useTheme()
  const current = value != null ? options.find((o) => o.value === value) : undefined
  const isActive = value != null
  const displayLabel = current?.label ?? label

  function open() {
    const labels = options.map((o) => o.label)
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: [...labels, 'Cancel'], cancelButtonIndex: labels.length },
        (idx) => {
          if (idx < options.length) onSelect(options[idx].value)
        },
      )
    } else {
      Alert.alert(label, undefined, [
        ...options.map((o) => ({ text: o.label, onPress: () => onSelect(o.value) })),
        { text: 'Cancel', style: 'cancel' as const },
      ])
    }
  }

  return (
    <TouchableOpacity
      onPress={open}
      activeOpacity={Opacity.pressedLight}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${displayLabel}`}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        height: 34,
        borderRadius: Radii.pill,
        borderWidth: isActive ? Borders.medium : Borders.thin,
        borderColor: isActive ? Colors.text : Colors.border,
        backgroundColor: isActive ? Colors.text : Colors.searchBg,
        paddingHorizontal: 8,
        overflow: 'hidden',
      }}
    >
      <Text
        fontSize={12}
        fontWeight="600"
        color={isActive ? Colors.card : Colors.text}
        numberOfLines={1}
      >
        {displayLabel}
      </Text>
      <MaterialIcons
        name="expand-more"
        size={14}
        color={isActive ? Colors.card : Colors.secondaryText}
      />
    </TouchableOpacity>
  )
}

// ---------------------------------------------------------------------------
// Leave-at pill — opens native date + time picker
// ---------------------------------------------------------------------------

type LeavePillProps = {
  value: Date | null
  onChange: (v: Date | null) => void
}

export function LeavePill({ value, onChange }: LeavePillProps) {
  const { Colors, Radii } = useTheme()
  const [showModal, setShowModal] = useState(false)
  const [pending, setPending] = useState<Date>(new Date())

  const isActive = value !== null
  const displayLabel = value ? `Leave ${formatDepart(value)}` : 'Leave now'

  function open() {
    const initial = value ?? new Date()
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Leave now', 'Choose time…', 'Cancel'], cancelButtonIndex: 2 },
        (idx) => {
          if (idx === 0) onChange(null)
          else if (idx === 1) {
            setPending(initial)
            setShowModal(true)
          }
        },
      )
    } else {
      Alert.alert('Leave at', undefined, [
        { text: 'Leave now', onPress: () => onChange(null) },
        {
          text: 'Choose time…',
          onPress: () =>
            DateTimePickerAndroid.open({
              value: initial,
              mode: 'date',
              is24Hour: true,
              onChange: (event, date) => {
                if (event.type !== 'set' || !date) return
                DateTimePickerAndroid.open({
                  value: date,
                  mode: 'time',
                  is24Hour: true,
                  onChange: (timeEvent, dateTime) => {
                    if (timeEvent.type !== 'set' || !dateTime) return
                    onChange(dateTime)
                  },
                })
              },
            }),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ])
    }
  }

  return (
    <>
      <TouchableOpacity
        onPress={open}
        activeOpacity={Opacity.pressedLight}
        accessibilityRole="button"
        accessibilityLabel={displayLabel}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          height: 34,
          borderRadius: Radii.pill,
          borderWidth: isActive ? Borders.medium : Borders.thin,
          borderColor: isActive ? Colors.text : Colors.border,
          backgroundColor: isActive ? Colors.text : Colors.searchBg,
          paddingHorizontal: 8,
          overflow: 'hidden',
        }}
      >
        <MaterialIcons
          name="schedule"
          size={13}
          color={isActive ? Colors.card : Colors.secondaryText}
        />
        <Text
          fontSize={12}
          fontWeight="600"
          color={isActive ? Colors.card : Colors.text}
          numberOfLines={1}
        >
          {displayLabel}
        </Text>
        <MaterialIcons
          name="expand-more"
          size={14}
          color={isActive ? Colors.card : Colors.secondaryText}
        />
      </TouchableOpacity>

      {/* iOS date-time picker in a bottom sheet modal */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowModal(false)}
        >
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
              activeOpacity={1}
              onPress={() => setShowModal(false)}
            />
            <View
              style={{
                backgroundColor: Colors.card,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 40,
              }}
            >
              <XStack justify="space-between" mb="$3">
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Text fontSize={16} color={Colors.blue}>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <Text fontSize={16} fontWeight="700" color={Colors.text}>
                  Leave at
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    onChange(pending)
                    setShowModal(false)
                  }}
                >
                  <Text fontSize={16} fontWeight="700" color={Colors.blue}>
                    Done
                  </Text>
                </TouchableOpacity>
              </XStack>
              <DateTimePicker
                value={pending}
                mode="datetime"
                display="spinner"
                onChange={(_, date) => {
                  if (date) setPending(date)
                }}
                style={{ height: 200 }}
              />
            </View>
          </View>
        </Modal>
      )}
    </>
  )
}
