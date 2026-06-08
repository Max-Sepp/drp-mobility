// Journey planner as a bottom sheet — replaces JourneyPlannerScreen.
// Two snaps: 75% for the input form, 92% for results.
// JourneyDetail still navigates on the stack (Phase 6 will sheet-ify it).

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { useStations } from '@/features/stations'
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
import type { RootStackParamList } from '@/navigation/types'
import type { JourneyDetailParams } from '@/features/home/components/JourneyDetailSheet'
import { useTheme, Borders, Heights, Opacity, Spacing, Typography } from '@/theme'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JourneyResult = { journey: Journey; outages: StationOutage[]; tags: RouteTag[] }
type Resolved = { from: ResolvedLocation; to: ResolvedLocation }

export type JourneyPlan = {
  initialFrom?: ResolvedLocation
  initialTo?: ResolvedLocation
}

type Props = {
  plan: JourneyPlan | null // null = closed
  onClose: () => void
  onJourneySelect: (params: JourneyDetailParams) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCREEN_H = Dimensions.get('window').height
const SNAP_POINTS = [SCREEN_H * 0.75, SCREEN_H * 0.92]

const LEVELS: { value: AccessibilityPreference; label: string }[] = [
  { value: 'StepFreeToVehicle', label: 'Step-free to train' },
  { value: 'StepFreeToPlatform', label: 'Step-free to platform' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function JourneyPlannerSheet({ plan, onClose, onJourneySelect }: Props) {
  const { Colors, Radii } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
        },
        savedBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: Spacing.sm,
          paddingVertical: 6,
          borderRadius: Radii.pill,
          backgroundColor: Colors.blueBg,
        },
        closeBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        content: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xs,
        },
      }),
    [Colors, Radii],
  )
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetRef>(null)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [fromPostcode, setFromPostcode] = useState<string | null>(null)
  const [toPostcode, setToPostcode] = useState<string | null>(null)
  const [fromIsCurrentLocation, setFromIsCurrentLocation] = useState(false)
  const [toIsNamedPlace, setToIsNamedPlace] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)
  const [level, setLevel] = useState<AccessibilityPreference | null>(null)
  const [departAt, setDepartAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<JourneyResult[]>([])
  const [resolved, setResolved] = useState<Resolved | null>(null)
  const [editing, setEditing] = useState(false)
  const [savedCount, setSavedCount] = useState(0)

  const showInputs = results.length === 0 || editing

  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const cachedCoords = useAppLocation()
  const resolveStation = useCallback(
    (name: string) => resolveStationName(name, stationNames),
    [stationNames],
  )

  // ── Current-location helper ────────────────────────────────────────────

  const handleCurrentLocation = useCallback(
    async (silent = false) => {
      setGettingLocation(true)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          if (!silent) Alert.alert('Location required', 'Enable location access in Settings.')
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

  // ── Open/close driven by plan prop ────────────────────────────────────

  useEffect(() => {
    if (plan) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFrom(plan.initialFrom?.label ?? '')
      setTo(plan.initialTo?.label ?? '')
      setFromPostcode(plan.initialFrom?.postcode ?? null)
      setToPostcode(plan.initialTo?.postcode ?? null)
      setFromIsCurrentLocation(plan.initialFrom?.label === 'Current location')
      setToIsNamedPlace(Boolean(plan.initialTo?.isNamedPlace))
      setLevel(null)
      setDepartAt(null)
      setResults([])
      setResolved(null)
      setEditing(false)
      setGettingLocation(false)
      setLoading(false)
      sheetRef.current?.snapToIndex(0)
      loadSavedJourneys().then((s) => setSavedCount(s.length))
      if (!plan.initialFrom) {
        handleCurrentLocation(true)
      }
    } else {
      sheetRef.current?.close()
    }
  }, [plan]) // eslint-disable-line react-hooks/exhaustive-deps

  // Advance to results snap when results arrive
  useEffect(() => {
    if (results.length > 0) sheetRef.current?.snapToIndex(1)
  }, [results])

  // Return to form snap when editing
  useEffect(() => {
    if (editing) sheetRef.current?.snapToIndex(0)
  }, [editing])

  function handleChange(index: number) {
    if (index === -1) onClose()
  }

  // ── Journey planning ──────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onChange={handleChange}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
      >
        {/* Header scrolls with content so it disappears naturally when reading results */}
        <View style={styles.header}>
          <Text fontSize={18} fontWeight="700" color={Colors.text} style={{ flex: 1 }}>
            Plan a journey
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('SavedJourneys')}
            style={styles.savedBtn}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Saved journeys${savedCount > 0 ? `, ${savedCount}` : ''}`}
          >
            <MaterialIcons name="bookmark" size={15} color={Colors.blue} />
            <Text fontSize={13} fontWeight="600" color={Colors.blue}>
              Saved{savedCount > 0 ? ` (${savedCount})` : ''}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => sheetRef.current?.close()}
            style={styles.closeBtn}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Close journey planner"
          >
            <MaterialIcons name="close" size={18} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {showInputs ? (
          <YStack gap="$3">
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
              <Text
                fontSize={Typography.body.fontSize}
                fontWeight="600"
                color={Colors.secondaryText}
              >
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
              mb="$2"
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
            onStationPress={(station) => navigation.navigate('Station', { station })}
            onPress={() =>
              onJourneySelect({
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
      </BottomSheetScrollView>
    </BottomSheet>
  )
}
