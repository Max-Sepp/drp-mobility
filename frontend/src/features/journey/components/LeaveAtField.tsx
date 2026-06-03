import { MaterialIcons } from '@expo/vector-icons'
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker'
import { Platform } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { Borders, Colors, Heights, Radii } from '@/theme'

type LeaveAtFieldProps = {
  /** The chosen departure time, or null to leave now. */
  value: Date | null
  onChange: (value: Date | null) => void
}

/** "Today, 09:15" / "Wed 4 Jun, 09:15" for the chosen departure time. */
export function formatDepart(date: Date): string {
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return `Today, ${time}`
  const day = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day}, ${time}`
}

const SEGMENT_STYLE = {
  flex: 1,
  minHeight: Heights.touchTarget,
  borderRadius: Radii.button,
  borderWidth: Borders.medium,
} as const

/**
 * "Leave at" control: a Now / Later toggle. Choosing Later opens the platform's native date+time
 * picker (an imperative two-step date→time flow on Android; a single combined picker on iOS).
 */
export const LeaveAtField = ({ value, onChange }: LeaveAtFieldProps) => {
  // iOS renders the picker inline as a component; this toggles it. Android uses the imperative
  // DateTimePickerAndroid API, so it never needs this flag.
  const isLater = value !== null

  function openAndroidPicker(initial: Date) {
    // Android can only pick a date or a time per dialog, so chain: date first, then time.
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
    })
  }

  function chooseLater() {
    const initial = value ?? new Date()
    if (Platform.OS === 'android') {
      openAndroidPicker(initial)
    } else {
      // Seed a value so the inline iOS picker appears; the user adjusts from there.
      onChange(initial)
    }
  }

  return (
    <YStack gap="$1.5">
      <Text fontSize={14} fontWeight="600" color={Colors.secondaryText}>
        Leave at
      </Text>
      <XStack gap="$2">
        <YStack
          items="center"
          justify="center"
          pressStyle={{ opacity: 0.8 }}
          onPress={() => onChange(null)}
          style={{
            ...SEGMENT_STYLE,
            borderColor: !isLater ? Colors.text : Colors.border,
            backgroundColor: !isLater ? Colors.text : Colors.searchBg,
          }}
        >
          <Text fontSize={14} fontWeight="600" color={!isLater ? Colors.card : Colors.text}>
            Now
          </Text>
        </YStack>
        <YStack
          items="center"
          justify="center"
          gap="$0.5"
          pressStyle={{ opacity: 0.8 }}
          onPress={chooseLater}
          role="button"
          aria-label={
            isLater ? `Leaving ${formatDepart(value)}, tap to change` : 'Leave later'
          }
          style={{
            ...SEGMENT_STYLE,
            paddingHorizontal: 8,
            borderColor: isLater ? Colors.text : Colors.border,
            backgroundColor: isLater ? Colors.text : Colors.searchBg,
          }}
        >
          <XStack items="center" gap="$1.5">
            <MaterialIcons name="schedule" size={16} color={isLater ? Colors.card : Colors.text} />
            <Text fontSize={14} fontWeight="600" color={isLater ? Colors.card : Colors.text}>
              {isLater ? formatDepart(value) : 'Later'}
            </Text>
          </XStack>
        </YStack>
      </XStack>

      {/* iOS shows the picker inline once a time is chosen; Android uses the dialog above. */}
      {Platform.OS === 'ios' && isLater && (
        <DateTimePicker
          value={value}
          mode="datetime"
          onChange={(event, date) => {
            if (event.type === 'set' && date) onChange(date)
          }}
        />
      )}
    </YStack>
  )
}
