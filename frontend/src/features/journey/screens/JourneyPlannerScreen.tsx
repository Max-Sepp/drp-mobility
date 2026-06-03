import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { loadSavedJourneys } from '../api/savedJourneys'
import {
  type AccessibilityPreference,
  type Journey,
  planJourneyOptions,
  type RouteTag,
} from '../api/tfl'
import { JourneyResultCard } from '../components/JourneyResultCard'
import { formatDepart, LeaveAtField } from '../components/LeaveAtField'
import { LocationInput } from '../components/LocationInput'
import { Borders, Colors, Heights, Radii, Typography } from '@/theme'

type Resolved = { from: ResolvedLocation; to: ResolvedLocation }
type JourneyResult = { journey: Journey; outages: StationOutage[]; tags: RouteTag[] }

const LEVELS: { value: AccessibilityPreference; label: string }[] = [
  { value: 'StepFreeToVehicle', label: 'Step-free to train' },
  { value: 'StepFreeToPlatform', label: 'Step-free to platform' },
]

export const JourneyPlannerScreen = ({ navigation, route }: JourneyPlannerScreenProps) => {
  const [from, setFrom] = useState(route.params?.initialFrom?.label ?? '')
  const [to, setTo] = useState(route.params?.initialTo?.label ?? '')
  const [fromPostcode, setFromPostcode] = useState<string | null>(
    route.params?.initialFrom?.postcode ?? null,
  )
  const [toPostcode, setToPostcode] = useState<string | null>(
    route.params?.initialTo?.postcode ?? null,
  )
  const [fromIsCurrentLocation, setFromIsCurrentLocation] = useState(
    route.params?.initialFrom?.label === 'Current location',
  )
  const [gettingLocation, setGettingLocation] = useState(false)
  const [level, setLevel] = useState<AccessibilityPreference | null>(null)
  const [departAt, setDepartAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<JourneyResult[]>([])
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [editing, setEditing] = useState(false)
  const showInputs = results.length === 0 || editing

  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const resolveStation = useCallback(
    (commonName: string) => resolveStationName(commonName, stationNames),
    [stationNames],
  )
  const openStation = (station: string) => navigation.navigate('Station', { station })

  const [savedCount, setSavedCount] = useState(0)
  useEffect(() => {
    const reload = () => loadSavedJourneys().then((s) => setSavedCount(s.length))
    reload()
    return navigation.addListener('focus', reload)
  }, [navigation])

  const handleCurrentLocation = useCallback(async () => {
    setGettingLocation(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location required', 'Enable location access in Settings to use this feature.')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const result = await resolveToPostcode(`${pos.coords.latitude},${pos.coords.longitude}`)
      if ('error' in result) {
        Alert.alert('Location error', result.error)
        return
      }
      setFrom('Current location')
      setFromPostcode(result.postcode)
      setFromIsCurrentLocation(true)
    } finally {
      setGettingLocation(false)
    }
  }, [])

  useEffect(() => {
    if (!route.params?.initialFrom) {
      handleCurrentLocation().catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (!from.trim() || !to.trim()) {
      Alert.alert('Required', 'Please enter both a start and a destination.')
      return
    }
    setLoading(true)
    setResults([])
    setResolved(null)

    const resolveField = (text: string, postcode: string | null) =>
      postcode
        ? Promise.resolve({ postcode, label: text } as ResolvedLocation)
        : resolveToPostcode(text)
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

    const result = await planJourneyOptions(fromLoc.postcode, toLoc.postcode, level, departAt)
    if (result.kind !== 'journeys') {
      setLoading(false)
      Alert.alert('No journey', result.message)
      return
    }

    const outages = await outagesPromise
    const flagged = result.journeys.map(({ journey, tags }) => ({
      journey,
      tags,
      outages: matchOutages(journey, outages),
    }))
    flagged.sort((a, b) => Number(a.outages.length > 0) - Number(b.outages.length > 0))
    setResults(flagged)
    setEditing(false)
    setLoading(false)
  }

  return (
    <FormScreenLayout
      header={
        <ScreenHeader
          title="Plan a journey"
          onBack={() => navigation.goBack()}
          right={
            <XStack
              items="center"
              gap="$1"
              pressStyle={{ opacity: 0.6 }}
              onPress={() => navigation.navigate('SavedJourneys')}
              role="button"
            >
              <MaterialIcons name="bookmark" size={18} color={Colors.blue} />
              <Text fontSize={14} fontWeight="600" color={Colors.blue}>
                Saved{savedCount > 0 ? ` (${savedCount})` : ''}
              </Text>
            </XStack>
          }
        />
      }
      footer={null}
    >
      {showInputs ? (
        <YStack px="$5" mt="$5" gap="$3">
          <LocationInput
            label="From"
            value={from}
            onChangeText={(text) => {
              setFrom(text)
              setFromIsCurrentLocation(false)
            }}
            onResolved={setFromPostcode}
            isResolved={fromPostcode !== null}
            textColor={fromIsCurrentLocation ? Colors.blue : undefined}
            textBold={fromIsCurrentLocation}
            onCurrentLocation={handleCurrentLocation}
            currentLocationLoading={gettingLocation}
          />
          <LocationInput
            label="To"
            value={to}
            onChangeText={setTo}
            onResolved={setToPostcode}
            isResolved={toPostcode !== null}
          />

          <YStack gap="$1.5">
            <Text fontSize={Typography.body.fontSize} fontWeight="600" color={Colors.secondaryText}>
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
                      minHeight: Heights.touchTarget,
                      borderRadius: Radii.button,
                      borderWidth: Borders.medium,
                      borderColor: selected ? Colors.text : Colors.border,
                      backgroundColor: selected ? Colors.text : Colors.searchBg,
                    }}
                  >
                    <Text fontSize={14} fontWeight="600" color={selected ? Colors.card : Colors.text}>
                      {label}
                    </Text>
                  </YStack>
                )
              })}
            </XStack>
          </YStack>

          <LeaveAtField value={departAt} onChange={setDepartAt} />

          <YStack
            mt="$2"
            items="center"
            justify="center"
            pressStyle={{ opacity: 0.8 }}
            onPress={loading ? undefined : run}
            opacity={loading ? 0.6 : 1}
            style={{ backgroundColor: Colors.text, borderRadius: Radii.button, height: Heights.button }}
          >
            <Text color={Colors.card} fontSize={16} fontWeight="700">
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
              borderWidth: Borders.medium,
              borderColor: Colors.border,
              borderRadius: Radii.button,
              backgroundColor: Colors.searchBg,
            }}
          >
            <YStack flex={1} gap="$1">
              <XStack gap="$2" items="center">
                <MaterialIcons name="trip-origin" size={14} color={Colors.secondaryText} style={{ width: 18 }} />
                <Text fontSize={14} color={Colors.text} flex={1} numberOfLines={1}>
                  {resolved.from.label}
                </Text>
              </XStack>
              <XStack gap="$2" items="center">
                <MaterialIcons name="place" size={16} color={Colors.secondaryText} style={{ width: 18 }} />
                <Text fontSize={14} color={Colors.text} flex={1} numberOfLines={1}>
                  {resolved.to.label}
                </Text>
              </XStack>
              {departAt && (
                <XStack gap="$2" items="center">
                  <MaterialIcons name="schedule" size={14} color={Colors.secondaryText} style={{ width: 18 }} />
                  <Text fontSize={14} color={Colors.secondaryText} flex={1} numberOfLines={1}>
                    Leaving {formatDepart(departAt)}
                  </Text>
                </XStack>
              )}
            </YStack>
            <XStack items="center" gap="$1">
              <MaterialIcons name="edit" size={16} color={Colors.blue} />
              <Text fontSize={14} fontWeight="600" color={Colors.blue}>
                Edit
              </Text>
            </XStack>
          </XStack>
        )
      )}

      {results.map(({ journey, outages, tags }, i) => (
        <JourneyResultCard
          key={i}
          journey={journey}
          outages={outages}
          tags={tags}
          from={resolved?.from}
          to={resolved?.to}
          resolveStation={resolveStation}
          onStationPress={openStation}
          onPress={() =>
            navigation.navigate('JourneyDetail', {
              journey,
              from: resolved?.from,
              to: resolved?.to,
              outages,
              level,
              tags,
            })
          }
        />
      ))}
    </FormScreenLayout>
  )
}
