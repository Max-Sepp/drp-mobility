import { MaterialIcons } from '@expo/vector-icons'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { useRef, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Modal,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native'
import { Text, XStack } from 'tamagui'
import { formatDepart } from '@/features/journey/components/LeaveAtField'
import { type TimeConstraint } from '@/features/journey/api/tfl'
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
        color={isActive ? Colors.card : Colors.secondaryText}
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
// Leave-at / Arrive-by pill — opens native date + time picker
// ---------------------------------------------------------------------------

type LeavePillProps = {
  value: TimeConstraint | null
  onChange: (v: TimeConstraint | null) => void
}

export function LeavePill({ value, onChange }: LeavePillProps) {
  const { Colors, Radii } = useTheme()
  const [showModal, setShowModal] = useState(false)
  const [pending, setPending] = useState<Date>(new Date())
  const pendingMode = useRef<'depart' | 'arrive'>('depart')
  const backdropAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(320)).current

  const isActive = value !== null

  let displayLabel: string
  if (!value) {
    displayLabel = 'Leave now'
  } else if (value.mode === 'depart') {
    displayLabel = `Leave ${formatDepart(value.at)}`
  } else {
    displayLabel = `Arrive by ${formatDepart(value.by)}`
  }

  function openModal(initial: Date, mode: 'depart' | 'arrive') {
    pendingMode.current = mode
    setPending(initial)
    backdropAnim.setValue(0)
    slideAnim.setValue(320)
    setShowModal(true)
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start()
  }

  function closeModal() {
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 320, duration: 250, useNativeDriver: true }),
    ]).start(() => setShowModal(false))
  }

  function confirmModal() {
    if (pendingMode.current === 'depart') {
      onChange({ mode: 'depart', at: pending })
    } else {
      onChange({ mode: 'arrive', by: pending })
    }
    closeModal()
  }

  function open() {
    const currentTime = value ? (value.mode === 'depart' ? value.at : value.by) : new Date()
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Leave now', 'Leave at…', 'Arrive by…', 'Cancel'], cancelButtonIndex: 3 },
        (idx) => {
          if (idx === 0) onChange(null)
          else if (idx === 1) setTimeout(() => openModal(currentTime, 'depart'), 50)
          else if (idx === 2) setTimeout(() => openModal(currentTime, 'arrive'), 50)
        },
      )
    } else {
      Alert.alert('Journey time', undefined, [
        { text: 'Leave now', onPress: () => onChange(null) },
        {
          text: 'Leave at…',
          onPress: () =>
            DateTimePickerAndroid.open({
              value: currentTime,
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
                    onChange({ mode: 'depart', at: dateTime })
                  },
                })
              },
            }),
        },
        {
          text: 'Arrive by…',
          onPress: () =>
            DateTimePickerAndroid.open({
              value: currentTime,
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
                    onChange({ mode: 'arrive', by: dateTime })
                  },
                })
              },
            }),
        },
        { text: 'Cancel', style: 'cancel' as const },
      ])
    }
  }

  const modalTitle = pendingMode.current === 'depart' ? 'Leave at' : 'Arrive by'

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
          color={isActive ? Colors.card : Colors.secondaryText}
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

      {/* iOS date-time picker modal — backdrop fades, card slides up */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={showModal}
          transparent
          animationType="none"
          onRequestClose={closeModal}
        >
          <View style={StyleSheet.absoluteFill}>
            {/* Fading dark backdrop */}
            <Animated.View
              style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', opacity: backdropAnim }]}
            />
            {/* Tap above card to dismiss */}
            <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeModal} />
            {/* Card slides up from bottom */}
            <Animated.View
              style={{
                transform: [{ translateY: slideAnim }],
                backgroundColor: Colors.card,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                paddingHorizontal: 16,
                paddingTop: 16,
                paddingBottom: 40,
              }}
            >
              <XStack justify="space-between" mb="$3">
                <TouchableOpacity onPress={closeModal}>
                  <Text fontSize={16} color={Colors.blue}>Cancel</Text>
                </TouchableOpacity>
                <Text fontSize={16} fontWeight="700" color={Colors.text}>{modalTitle}</Text>
                <TouchableOpacity onPress={confirmModal}>
                  <Text fontSize={16} fontWeight="700" color={Colors.blue}>Done</Text>
                </TouchableOpacity>
              </XStack>
              <DateTimePicker
                value={pending}
                mode="datetime"
                display="spinner"
                themeVariant="light"
                onChange={(_, date) => { if (date) setPending(date) }}
                style={{ height: 200 }}
              />
            </Animated.View>
          </View>
        </Modal>
      )}
    </>
  )
}
