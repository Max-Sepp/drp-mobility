import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useStations } from '@/features/stations'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import type { JourneyPlannerScreenProps } from '@/navigation/types'
import {
  fetchStationOutages,
  matchOutages,
  resolveStationName,
  type StationOutage,
} from '../api/accessibility'
import { type ResolvedLocation, resolveToPostcode } from '../api/geocode'
import { type AccessibilityPreference, type Journey, planJourney } from '../api/tfl'
import { JourneyResultCard } from '../components/JourneyResultCard'
import { LocationInput } from '../components/LocationInput'

type Resolved = { from: ResolvedLocation; to: ResolvedLocation }
// A journey paired with the live outages (from our data) affecting the stations it touches.
type JourneyResult = { journey: Journey; outages: StationOutage[] }

const LEVELS: { value: AccessibilityPreference; label: string }[] = [
  { value: 'StepFreeToVehicle', label: 'Step-free to train' },
  { value: 'StepFreeToPlatform', label: 'Step-free to platform' },
]

export const JourneyPlannerScreen = ({ navigation }: JourneyPlannerScreenProps) => {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  // Postcode resolved from a chosen suggestion, used behind the scenes so the box can keep
  // showing the readable address. Null when the user typed a value we resolve at submit.
  const [fromPostcode, setFromPostcode] = useState<string | null>(null)
  const [toPostcode, setToPostcode] = useState<string | null>(null)
  // Null means no accessibility filtering at all — TfL then returns every mode (tube, rail, …)
  // rather than only step-free routes. Each button toggles, so the user can deselect both.
  const [level, setLevel] = useState<AccessibilityPreference | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<JourneyResult[]>([])
  const [resolved, setResolved] = useState<Resolved | null>(null)
  // Once a journey is shown the bulky inputs collapse to a compact summary; "Edit" reopens
  // them. Editing stays true until the next successful plan so the user can change and re-run.
  const [editing, setEditing] = useState(false)
  const showInputs = results.length === 0 || editing

  // Resolve the TfL station names on a journey to our own station list so each can link through
  // to its detail screen (platform access, quick reports). Unknown stations stay non-tappable.
  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const resolveStation = useCallback(
    (commonName: string) => resolveStationName(commonName, stationNames),
    [stationNames],
  )
  const openStation = (station: string) => navigation.navigate('Station', { station })

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
    // Fetch our live outage data in parallel with resolving the locations.
    const outagesPromise = fetchStationOutages()
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

    const result = await planJourney(fromLoc.postcode, toLoc.postcode, level)
    if (result.kind !== 'journeys') {
      setLoading(false)
      Alert.alert('No journey', result.message)
      return
    }

    // Flag journeys against our live outage data, then sort flagged ones to the bottom
    // (stable: TfL's ordering is preserved within the clean and flagged groups).
    const outages = await outagesPromise
    const flagged = result.journeys.map((journey) => ({
      journey,
      outages: matchOutages(journey, outages),
    }))
    flagged.sort((a, b) => Number(a.outages.length > 0) - Number(b.outages.length > 0))
    setResults(flagged)
    setEditing(false)
    setLoading(false)
  }

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Plan a journey" />}
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

          <YStack gap="$1.5">
            <Text fontSize={14} fontWeight="600" color="#6b7280">
              Accessibility (optional)
            </Text>
            <XStack gap="$2">
              {LEVELS.map(({ value, label }) => {
                const selected = level === value
                return (
                  <YStack
                    key={value}
                    flex={1}
                    items="center"
                    justify="center"
                    pressStyle={{ opacity: 0.8 }}
                    onPress={() => setLevel((prev) => (prev === value ? null : value))}
                    style={{
                      minHeight: 48,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: selected ? '#111827' : '#d1d5db',
                      backgroundColor: selected ? '#111827' : '#f9fafb',
                    }}
                  >
                    <Text fontSize={14} fontWeight="600" color={selected ? 'white' : '#374151'}>
                      {label}
                    </Text>
                  </YStack>
                )
              })}
            </XStack>
          </YStack>

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

      {results.map(({ journey, outages }, i) => (
        <JourneyResultCard
          key={i}
          journey={journey}
          outages={outages}
          from={resolved?.from}
          to={resolved?.to}
          resolveStation={resolveStation}
          onStationPress={openStation}
        />
      ))}
    </FormScreenLayout>
  )
}
