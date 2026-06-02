import { MaterialIcons } from '@expo/vector-icons'
import { useState } from 'react'
import { Alert } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import type { JourneyPlannerScreenProps } from '@/navigation/types'
import { type ResolvedLocation, resolveToPostcode } from '../api/geocode'
import { type Journey, planJourney } from '../api/tfl'
import { JourneyResultCard } from '../components/JourneyResultCard'
import { LocationInput } from '../components/LocationInput'

type Resolved = { from: ResolvedLocation; to: ResolvedLocation }

export const JourneyPlannerScreen = ({ navigation }: JourneyPlannerScreenProps) => {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Postcode resolved from a chosen suggestion, used behind the scenes so the box can keep
  // showing the readable address. Null when the user typed a value we resolve at submit.
  const [fromPostcode, setFromPostcode] = useState<string | null>(null)
  const [toPostcode, setToPostcode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<Journey[]>([])
  const [resolved, setResolved] = useState<Resolved | null>(null)
  // Once a journey is shown the bulky inputs collapse to a compact summary; "Edit" reopens
  // them. Editing stays true until the next successful plan so the user can change and re-run.
  const [editing, setEditing] = useState(false)
  const showInputs = results.length === 0 || editing

  async function run() {
    if (!from.trim() || !to.trim()) {
      Alert.alert('Required', 'Please enter both a start and a destination.')
      return
    }
    setLoading(true)
    setResults([])
    setResolved(null)

    // Use the postcode already resolved from a dropdown selection; otherwise convert the
    // typed text (a postcode or coordinates) now. Either way we query postcode-to-postcode.
    const resolveField = (text: string, postcode: string | null) =>
      postcode
        ? Promise.resolve({ postcode, label: text } as ResolvedLocation)
        : resolveToPostcode(text)
    const [fromLoc, toLoc] = await Promise.all([
      resolveField(from, fromPostcode),
      resolveField(to, toPostcode),
    ])
    if ('error' in fromLoc) {
      setLoading(false)
      Alert.alert('Start location', fromLoc.error)
      return
    }
    if ('error' in toLoc) {
      setLoading(false)
      Alert.alert('Destination', toLoc.error)
      return
    }
    setResolved({ from: fromLoc, to: toLoc })

    const result = await planJourney(fromLoc.postcode, toLoc.postcode)
    setLoading(false)
    if (result.kind === 'journeys') {
      setResults(result.journeys)
      setEditing(false)
    } else {
      Alert.alert('No journey', result.message)
    }
  }

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Plan a journey" onBack={() => navigation.goBack()} />}
      footer={null}
    >
      {showInputs ? (
        <YStack px="$5" mt="$5" gap="$3">
          <LocationInput
            label="From"
            value={from}
            onChangeText={setFrom}
            onResolved={setFromPostcode}
          />
          <LocationInput label="To" value={to} onChangeText={setTo} onResolved={setToPostcode} />

          <YStack
            mt="$2"
            items="center"
            justify="center"
            pressStyle={{ opacity: 0.8 }}
            onPress={loading ? undefined : run}
            opacity={loading ? 0.6 : 1}
            style={{ backgroundColor: '#111827', borderRadius: 10, height: 52 }}
          >
            <Text color="white" fontSize={16} fontWeight="700">
              {loading ? 'Planning…' : 'Plan journey'}
            </Text>
          </YStack>
        </YStack>
      ) : (
        resolved && (
          <XStack
            mx="$5"
            mt="$4"
            p="$3"
            items="center"
            gap="$3"
            pressStyle={{ opacity: 0.7 }}
            onPress={() => setEditing(true)}
            style={{
              borderWidth: 1.5,
              borderColor: '#d1d5db',
              borderRadius: 10,
              backgroundColor: '#f9fafb',
            }}
          >
            <YStack flex={1} gap="$1">
              <XStack gap="$2" items="center">
                <MaterialIcons name="trip-origin" size={14} color="#6b7280" style={{ width: 18 }} />
                <Text fontSize={14} color="#111827" flex={1} numberOfLines={1}>
                  {resolved.from.label}
                </Text>
              </XStack>
              <XStack gap="$2" items="center">
                <MaterialIcons name="place" size={16} color="#6b7280" style={{ width: 18 }} />
                <Text fontSize={14} color="#111827" flex={1} numberOfLines={1}>
                  {resolved.to.label}
                </Text>
              </XStack>
            </YStack>
            <XStack items="center" gap="$1">
              <MaterialIcons name="edit" size={16} color="#2563eb" />
              <Text fontSize={14} fontWeight="600" color="#2563eb">
                Edit
              </Text>
            </XStack>
          </XStack>
        )
      )}

      {results.map((journey, i) => (
        <JourneyResultCard key={i} journey={journey} from={resolved?.from} to={resolved?.to} />
      ))}
    </FormScreenLayout>
  )
}
