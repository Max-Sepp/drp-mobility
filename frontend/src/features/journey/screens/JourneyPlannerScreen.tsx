import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Keyboard, Pressable, StyleSheet, TouchableOpacity } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
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
import {
  type AccessibilityPreference,
  type Journey,
  type JourneyOptionsResult,
  type JourneyPreference,
  planJourney,
  planJourneyOptions,
  type RouteTag,
  type TaggedJourney,
} from '@/features/journey/api/tfl'
import { JourneyResultCard } from '@/features/journey/components/JourneyResultCard'
import { FilterPill, LeavePill } from '@/features/journey/components/FilterPill'
import { LocationInput } from '@/features/journey/components/LocationInput'
import { useTheme, Borders, Heights, Opacity } from '@/theme'

type Resolved = { from: ResolvedLocation; to: ResolvedLocation }
type JourneyResult = { journey: Journey; outages: StationOutage[]; tags: RouteTag[] }

const STEP_FREE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'No preference', value: null },
  { label: 'To platform', value: 'StepFreeToPlatform' },
  { label: 'To train (fully step-free)', value: 'StepFreeToVehicle' },
]

const PREFERENCE_OPTIONS: { label: string; value: string | null }[] = [
  { label: 'No preference', value: null },
  { label: 'Fastest', value: 'LeastTime' },
  { label: 'Fewest changes', value: 'LeastInterchange' },
  { label: 'Least walking', value: 'LeastWalking' },
]

const PREF_TAG: Record<JourneyPreference, RouteTag> = {
  LeastTime: 'fastest',
  LeastInterchange: 'fewest-changes',
  LeastWalking: 'least-walking',
}

export const JourneyPlannerScreen = ({ navigation, route }: JourneyPlannerScreenProps) => {
  const { Colors, Radii } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        swapBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
          borderWidth: Borders.thin,
          borderColor: Colors.border,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
          alignSelf: 'flex-end',
          marginVertical: -4,
          marginRight: 24,
          zIndex: 10,
        },
        searchBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          height: Heights.button,
          borderRadius: Radii.button,
          backgroundColor: Colors.text,
          marginTop: 8,
        },
      }),
    [Colors, Radii],
  )

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
  const [preference, setPreference] = useState<JourneyPreference | null>(null)
  const [departAt, setDepartAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<JourneyResult[]>([])
  const [resolved, setResolved] = useState<Resolved | null>(null)

  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const cachedCoords = useAppLocation()
  const resolveStation = useCallback(
    (commonName: string) => resolveStationName(commonName, stationNames),
    [stationNames],
  )
  const openStation = (station: string) => navigation.navigate('Station', { station })

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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      handleCurrentLocation(true).catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function swapLocations() {
    const tempText = from
    const tempPostcode = fromPostcode
    setFrom(to)
    setFromPostcode(toPostcode)
    setFromIsCurrentLocation(false)
    setTo(tempText)
    setToPostcode(tempPostcode)
    setToIsNamedPlace(false)
  }

  async function run() {
    if (!fromPostcode || !toPostcode) return
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

    let optResult: JourneyOptionsResult
    if (preference) {
      const single = await planJourney(
        fromLoc.postcode,
        toLoc.postcode,
        level,
        departAt,
        preference,
      )
      if (single.kind !== 'journeys') {
        setLoading(false)
        Alert.alert('No journey', single.message)
        return
      }
      const tag = PREF_TAG[preference]
      optResult = {
        kind: 'journeys',
        journeys: single.journeys.map((journey): TaggedJourney => ({ journey, tags: [tag] })),
      }
    } else {
      optResult = await planJourneyOptions(fromLoc.postcode, toLoc.postcode, level, departAt)
    }

    if (optResult.kind !== 'journeys') {
      setLoading(false)
      Alert.alert('No journey', optResult.message)
      return
    }

    const outages = await outagesPromise
    const flagged = optResult.journeys.map(({ journey, tags }) => ({
      journey,
      tags,
      outages: matchOutages(journey, outages),
    }))
    flagged.sort((a, b) => Number(a.outages.length > 0) - Number(b.outages.length > 0))
    setResults(flagged)
    setLoading(false)
  }

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Plan a journey" onBack={() => navigation.goBack()} />}
      footer={null}
    >
      <Pressable onPress={Keyboard.dismiss} style={{ flex: 1 }}>
      <YStack px="$5" mt="$4" gap="$2">
        {/* Location inputs with swap */}
        <LocationInput
          label="From"
          value={from}
          onChangeText={(text) => {
            setFrom(text)
            setFromIsCurrentLocation(false)
            setFromPostcode(null)
          }}
          onResolved={setFromPostcode}
          onSelect={(label, postcode) => {
            setFrom(label)
            setFromPostcode(postcode)
            setFromIsCurrentLocation(false)
          }}
          isResolved={fromPostcode !== null}
          textColor={fromIsCurrentLocation ? Colors.blue : undefined}
          textBold={fromIsCurrentLocation}
          onCurrentLocation={handleCurrentLocation}
          currentLocationLoading={gettingLocation}
        />

        <TouchableOpacity
          onPress={swapLocations}
          style={styles.swapBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Swap start and destination"
        >
          <MaterialIcons name="swap-vert" size={18} color={Colors.secondaryText} />
        </TouchableOpacity>

        <LocationInput
          label="To"
          value={to}
          onChangeText={(text) => {
            setTo(text)
            setToIsNamedPlace(false)
            setToPostcode(null)
          }}
          onResolved={setToPostcode}
          onSelect={(label, postcode) => {
            setTo(label)
            setToPostcode(postcode)
          }}
          isResolved={toPostcode !== null}
          textColor={toIsNamedPlace ? Colors.blue : undefined}
          textBold={toIsNamedPlace}
        />

        {/* Filter row */}
        <XStack gap="$2" mt="$1">
          <LeavePill value={departAt} onChange={setDepartAt} />
          <FilterPill
            label="Step-free"
            options={STEP_FREE_OPTIONS}
            value={level}
            onSelect={(v) => setLevel(v as AccessibilityPreference | null)}
          />
          <FilterPill
            label="Preference"
            options={PREFERENCE_OPTIONS}
            value={preference}
            onSelect={(v) => setPreference(v as JourneyPreference | null)}
          />
        </XStack>

        {/* Search button */}
        <TouchableOpacity
          onPress={loading || !fromPostcode || !toPostcode ? undefined : run}
          activeOpacity={loading || !fromPostcode || !toPostcode ? 1 : 0.75}
          style={[styles.searchBtn, { opacity: loading || !fromPostcode || !toPostcode ? Opacity.disabledMid : 1 }]}
          accessibilityRole="button"
          accessibilityLabel="Search for journeys"
        >
          {loading ? (
            <Spinner size="small" color={Colors.card} />
          ) : (
            <MaterialIcons name="search" size={18} color={Colors.card} />
          )}
          <Text color={Colors.card} fontSize={15} fontWeight="700">
            {loading ? 'Searching…' : 'Search'}
          </Text>
        </TouchableOpacity>
      </YStack>

      {/* Results */}
      {results.map(({ journey, outages, tags }, i) => (
        <JourneyResultCard
          key={i}
          journey={journey}
          outages={outages}
          tags={tags}
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
      </Pressable>
    </FormScreenLayout>
  )
}
