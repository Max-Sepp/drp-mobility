import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { useAuth } from '@/features/auth'
import { useStations } from '@/features/stations'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import type { JourneyPlannerScreenProps } from '@/navigation/types'
import {
  fetchStationOutages,
  matchOutages,
  resolveStationName,
  type StationOutage,
} from '@/features/journey/api/accessibility'
import { type ResolvedLocation, resolveToPostcode } from '@/features/journey/api/geocode'
import { useAppLocation } from '@/lib/LocationContext'
import { loadSavedJourneys } from '@/features/journey/api/savedJourneys'
import {
  type AccessibilityPreference,
  type Journey,
  planJourneyOptions,
  type RouteTag,
} from '@/features/journey/api/tfl'
import { JourneyResultCard } from '@/features/journey/components/JourneyResultCard'
import { formatDepart, LeaveAtField } from '@/features/journey/components/LeaveAtField'
import { LocationInput } from '@/features/journey/components/LocationInput'
import { Borders, Colors, Heights, Opacity, Radii, Typography } from '@/theme'

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
  const [toIsNamedPlace, setToIsNamedPlace] = useState(
    Boolean(route.params?.initialTo?.isNamedPlace),
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
  const cachedCoords = useAppLocation()
  const resolveStation = useCallback(
    (commonName: string) => resolveStationName(commonName, stationNames),
    [stationNames],
  )
  const openStation = (station: string) => navigation.navigate('Station', { station })

  // Count of saved journeys for the header badge, refreshed on focus and on auth status change.
  const { status } = useAuth()
  const [savedCount, setSavedCount] = useState(0)
  useEffect(() => {
    const reload = () => loadSavedJourneys().then((s) => setSavedCount(s.length))
    reload()
    return navigation.addListener('focus', reload)
  }, [navigation, status])

  const handleCurrentLocation = useCallback(
    async (silent = false) => {
      setGettingLocation(true)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          if (!silent) {
            Alert.alert(
              'Location required',
              'Enable location access in Settings to use this feature.',
            )
          }
          return
        }
        const pos =
          cachedCoords ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords
        const result = await resolveToPostcode(`${pos.latitude},${pos.longitude}`)
        if ('error' in result) {
          if (!silent) Alert.alert('Location error', result.error)
          return
        }
        setFrom('Current location')
        setFromPostcode(result.postcode)
        setFromIsCurrentLocation(true)
      } finally {
        setGettingLocation(false)
      }
    },
    [cachedCoords],
  )

  useEffect(() => {
    if (!route.params?.initialFrom) {
      handleCurrentLocation(true).catch(() => {})
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

    const resolveField = (text: string, postcode: string | null, isNamedPlace?: boolean) =>
      postcode
        ? Promise.resolve({ postcode, label: text, isNamedPlace } as ResolvedLocation)
        : resolveToPostcode(text)
    const outagesPromise = fetchStationOutages()
    const [fromLoc, toLoc] = await Promise.all([
      resolveField(from, fromPostcode),
      resolveField(to, toPostcode, toIsNamedPlace || undefined),
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
            <XStack items="center" gap="$3">
              <XStack
                items="center"
                gap="$1"
                pressStyle={{ opacity: Opacity.disabledMid }}
                onPress={() => navigation.navigate('SavedJourneys')}
                role="button"
                aria-label={`Saved journeys${savedCount > 0 ? `, ${savedCount}` : ''}`}
              >
                <MaterialIcons name="bookmark" size={18} color={Colors.blue} />
                <Text fontSize={14} fontWeight="600" color={Colors.blue}>
                  Saved{savedCount > 0 ? ` (${savedCount})` : ''}
                </Text>
              </XStack>
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
            onChangeText={(text) => {
              setTo(text)
              setToIsNamedPlace(false)
            }}
            onResolved={setToPostcode}
            isResolved={toPostcode !== null}
            textColor={toIsNamedPlace ? Colors.blue : undefined}
            textBold={toIsNamedPlace}
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
                    pressStyle={{ opacity: Opacity.pressedLight }}
                    onPress={() => setLevel((prev) => (prev === value ? null : value))}
                    style={{
                      minHeight: Heights.touchTarget,
                      borderRadius: Radii.button,
                      borderWidth: Borders.medium,
                      borderColor: selected ? Colors.text : Colors.border,
                      backgroundColor: selected ? Colors.text : Colors.searchBg,
                    }}
                  >
                    <Text
                      fontSize={14}
                      fontWeight="600"
                      color={selected ? Colors.card : Colors.text}
                    >
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
            pressStyle={{ opacity: Opacity.pressedLight }}
            onPress={loading ? undefined : run}
            opacity={loading ? Opacity.disabledMid : 1}
            style={{
              backgroundColor: Colors.text,
              borderRadius: Radii.button,
              height: Heights.button,
            }}
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
            pressStyle={{ opacity: Opacity.pressed }}
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
                <MaterialIcons
                  name="trip-origin"
                  size={14}
                  color={Colors.secondaryText}
                  style={{ width: 18 }}
                />
                <Text
                  fontSize={14}
                  color={resolved.from.isNamedPlace ? Colors.blue : Colors.text}
                  fontWeight={resolved.from.isNamedPlace ? '700' : '400'}
                  flex={1}
                  numberOfLines={1}
                >
                  {resolved.from.label}
                </Text>
              </XStack>
              <XStack gap="$2" items="center">
                <MaterialIcons
                  name="place"
                  size={16}
                  color={Colors.secondaryText}
                  style={{ width: 18 }}
                />
                <Text
                  fontSize={14}
                  color={resolved.to.isNamedPlace ? Colors.blue : Colors.text}
                  fontWeight={resolved.to.isNamedPlace ? '700' : '400'}
                  flex={1}
                  numberOfLines={1}
                >
                  {resolved.to.label}
                </Text>
              </XStack>
              {departAt && (
                <XStack gap="$2" items="center">
                  <MaterialIcons
                    name="schedule"
                    size={14}
                    color={Colors.secondaryText}
                    style={{ width: 18 }}
                  />
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
