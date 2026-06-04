// The "follow" screen for a journey in progress. It walks the rider through the legs one at a
// time: the current leg is shown large, the station they're about to arrive at carries any live
// accessibility alerts, and the remaining legs trail below for context. Progress advances two
// ways, which share one `goTo` so they never desync:
//   • Manually — Previous / "Arrived" buttons (always available, works underground / GPS off).
//   • Automatically — when the device gets within ARRIVAL_RADIUS_M of the current leg's arrival
//     point. GPS is an assist only; the final leg is never auto-completed (an explicit tap ends
//     the journey, so we don't declare "arrived" on a noisy fix).
// Progress is persisted on every transition so the journey survives leaving the screen or
// restarting the app (resumed from the map-home banner).

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { useStations } from '@/features/stations'
import type { ActiveJourneyScreenProps } from '@/navigation/types'
import { resolveStationName } from '@/features/journey/api/accessibility'
import { assessOutages } from '@/features/journey/api/outageRelevance'
import {
  clearActiveJourney,
  loadActiveJourney,
  setActiveLegIndex,
} from '@/features/journey/api/activeJourney'
import {
  clockTime,
  humanizeSummary,
  LegStations,
  lineLabel,
  modeIcon,
  modeLabel,
} from '@/features/journey/components/legDisplay'
import { OutageDetail } from '@/features/journey/components/OutageDetail'
import { haversineMeters } from '@/lib/geo'
import { Borders, Colors, Heights, Opacity, Radii } from '@/theme'

// Treat the rider as "arrived" within this radius of a leg's arrival point. Wide enough to absorb
// GPS noise (typically 20–50 m in the open) without firing while the train is still approaching.
const ARRIVAL_RADIUS_M = 120

export const ActiveJourneyScreen = ({ navigation, route }: ActiveJourneyScreenProps) => {
  const { savedId, journey, from, to, outages = [] } = route.params
  const legs = journey.legs

  const [legIndex, setLegIndex] = useState(0)
  // Whether a GPS fix is being received, to set the rider's expectation in the body copy.
  const [gpsActive, setGpsActive] = useState(false)
  // Tracks the leg index we last auto-advanced from, so one physical arrival advances exactly one
  // leg rather than cascading on every position update while still inside the radius.
  const autoAdvancedFromRef = useRef<number | null>(null)

  // Resume at the persisted leg. The record is written before navigation, so on a fresh start this
  // reads back 0; on resume from the banner it restores wherever the rider left off.
  useEffect(() => {
    let active = true
    loadActiveJourney().then((record) => {
      if (active && record && record.savedId === savedId) setLegIndex(record.currentLegIndex)
    })
    return () => {
      active = false
    }
  }, [savedId])

  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const resolveStation = useCallback(
    (commonName: string) => resolveStationName(commonName, stationNames),
    [stationNames],
  )
  const openStation = (station: string) => navigation.navigate('Station', { station })

  const outageAssessments = useMemo(
    () => assessOutages(journey, outages, stations),
    [journey, outages, stations],
  )

  const lastIndex = legs.length - 1
  const currentLeg = legs[legIndex]
  const isFinalLeg = legIndex >= lastIndex

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(next, lastIndex))
      setLegIndex(clamped)
      void setActiveLegIndex(clamped)
    },
    [lastIndex],
  )

  // Latest values mirrored into refs so the GPS watch callback (subscribed once) can read current
  // progress without re-subscribing on every leg change.
  const legIndexRef = useRef(legIndex)
  const goToRef = useRef(goTo)
  useEffect(() => {
    legIndexRef.current = legIndex
    goToRef.current = goTo
  }, [legIndex, goTo])

  async function complete() {
    await clearActiveJourney()
    Alert.alert('Journey complete', 'You have arrived. Safe travels!', [
      { text: 'Done', onPress: () => navigation.popToTop() },
    ])
  }

  function endJourney() {
    Alert.alert(
      'End journey?',
      'This stops following the route. It stays in your saved journeys.',
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'End journey',
          style: 'destructive',
          onPress: async () => {
            await clearActiveJourney()
            navigation.popToTop()
          },
        },
      ],
    )
  }

  function onArrived() {
    if (isFinalLeg) void complete()
    else goTo(legIndex + 1)
  }

  // Screen-local high-accuracy watch — the shared LocationProvider watch is too coarse (30 s / 50 m)
  // for responsive auto-advance. Permission is owned by the global provider; we only read it here
  // and degrade to manual-only if it isn't granted. Proximity is checked in the callback (an
  // external-subscription event) reading the latest leg via refs: it never auto-completes the final
  // leg, and a ref guard ensures one physical arrival advances at most one leg.
  useEffect(() => {
    let cancelled = false
    let sub: Location.LocationSubscription | null = null
    ;(async () => {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (cancelled || status !== 'granted') return
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (loc) => {
          setGpsActive(true)
          const idx = legIndexRef.current
          if (idx >= legs.length - 1) return
          if (autoAdvancedFromRef.current === idx) return
          const arr = legs[idx]?.arrivalPoint
          if (typeof arr?.lat !== 'number' || typeof arr?.lon !== 'number') return
          const metres = haversineMeters(
            { latitude: loc.coords.latitude, longitude: loc.coords.longitude },
            { latitude: arr.lat, longitude: arr.lon },
          )
          if (metres <= ARRIVAL_RADIUS_M) {
            autoAdvancedFromRef.current = idx
            goToRef.current(idx + 1)
          }
        },
      )
      if (cancelled) {
        sub.remove()
        sub = null
      }
    })()
    return () => {
      cancelled = true
      sub?.remove()
    }
  }, [legs])

  // Alerts for the station the rider is about to arrive at on the current leg.
  const arrivalStation = currentLeg?.arrivalPoint?.commonName
    ? resolveStation(currentLeg.arrivalPoint.commonName)
    : null
  const upcomingAssessments = useMemo(
    () => (arrivalStation ? outageAssessments.filter((a) => a.stationName === arrivalStation) : []),
    [arrivalStation, outageAssessments],
  )

  const header = (
    <ScreenHeader
      title="Active journey"
      onBack={endJourney}
      right={
        <Text fontSize={14} fontWeight="700" color={Colors.secondaryText}>
          Leg {legIndex + 1} of {legs.length}
        </Text>
      }
    />
  )

  const footer = (
    <SafeAreaView edges={['bottom']} style={styles.controlBar}>
      <XStack mx="$5" my="$3" gap="$3">
        <YStack
          flex={1}
          items="center"
          justify="center"
          onPress={legIndex === 0 ? undefined : () => goTo(legIndex - 1)}
          pressStyle={{ opacity: Opacity.pressedLight }}
          opacity={legIndex === 0 ? Opacity.disabled : 1}
          role="button"
          aria-label="Previous leg"
          style={styles.secondaryButton}
        >
          <Text fontSize={16} fontWeight="700" color={Colors.text}>
            Previous
          </Text>
        </YStack>
        <YStack
          flex={1.4}
          items="center"
          justify="center"
          onPress={onArrived}
          pressStyle={{ opacity: Opacity.pressedLight }}
          role="button"
          aria-label={isFinalLeg ? 'Arrived, finish journey' : 'Arrived, go to next leg'}
          style={styles.primaryButton}
        >
          <XStack items="center" gap="$2">
            <MaterialIcons name="check-circle" size={20} color={Colors.card} />
            <Text fontSize={16} fontWeight="700" color={Colors.card}>
              {isFinalLeg ? 'Arrived — finish' : 'Arrived — next leg'}
            </Text>
          </XStack>
        </YStack>
      </XStack>
    </SafeAreaView>
  )

  if (!currentLeg) {
    return (
      <FormScreenLayout header={header} footer={null}>
        <YStack px="$5" mt="$6" items="center" gap="$3">
          <Spinner color={Colors.blue} />
          <Text fontSize={15} color={Colors.secondaryText}>
            Loading your journey…
          </Text>
        </YStack>
      </FormScreenLayout>
    )
  }

  const line = lineLabel(currentLeg)
  const legTimes =
    currentLeg.departureTime && currentLeg.arrivalTime
      ? `${clockTime(currentLeg.departureTime)} → ${clockTime(currentLeg.arrivalTime)}`
      : null
  const detailed =
    currentLeg.instruction.detailed &&
    currentLeg.instruction.detailed !== currentLeg.instruction.summary
      ? currentLeg.instruction.detailed
      : null
  const remaining = legs.slice(legIndex + 1)

  return (
    <FormScreenLayout header={header} footer={footer}>
      <YStack px="$5" mt="$4" gap="$4">
        {/* Current leg — emphasised */}
        <YStack
          p="$4"
          gap="$2"
          style={{
            borderWidth: Borders.thick,
            borderColor: Colors.blue,
            borderRadius: Radii.button,
            backgroundColor: Colors.card,
          }}
        >
          <XStack items="center" gap="$2">
            <MaterialIcons
              name={modeIcon(currentLeg.mode.name)}
              size={26}
              color={Colors.blue}
              aria-label={modeLabel(currentLeg.mode.name)}
            />
            <Text fontSize={13} fontWeight="700" color={Colors.blue}>
              {modeLabel(currentLeg.mode.name)} · now
            </Text>
          </XStack>
          <Text fontSize={19} fontWeight="700" color={Colors.text}>
            {humanizeSummary(currentLeg.instruction.summary, [from, to])}
          </Text>
          {line && (
            <Text fontSize={14} fontWeight="600" color={Colors.blue}>
              {line}
            </Text>
          )}
          <LegStations
            leg={currentLeg}
            resolveStation={resolveStation}
            onStationPress={openStation}
          />
          {!line && detailed && (
            <Text fontSize={14} color={Colors.text}>
              {humanizeSummary(detailed, [from, to])}
            </Text>
          )}
          {legTimes && (
            <Text fontSize={13} color={Colors.secondaryText}>
              {legTimes} · {currentLeg.duration} min
            </Text>
          )}
        </YStack>

        {/* How progress advances — set the rider's expectation for the buttons / auto-advance. */}
        <XStack items="center" gap="$2">
          <MaterialIcons
            name={gpsActive ? 'my-location' : 'location-disabled'}
            size={16}
            color={Colors.secondaryText}
          />
          <Text fontSize={13} color={Colors.secondaryText} flex={1}>
            {gpsActive
              ? 'Advancing automatically as you arrive — or tap Arrived.'
              : 'Tap Arrived when you reach each stop.'}
          </Text>
        </XStack>

        {/* Live accessibility alerts for the station this leg arrives at. */}
        <OutageDetail assessments={upcomingAssessments} />

        {/* Remaining legs — de-emphasised context. */}
        {remaining.length > 0 && (
          <YStack gap="$2">
            <Text fontSize={13} fontWeight="700" color={Colors.secondaryText}>
              COMING UP
            </Text>
            {remaining.map((leg, i) => (
              <XStack key={legIndex + 1 + i} gap="$2.5" items="center" opacity={Opacity.subtle}>
                <MaterialIcons
                  name={modeIcon(leg.mode.name)}
                  size={20}
                  color={Colors.secondaryText}
                  aria-label={modeLabel(leg.mode.name)}
                  style={{ width: 22 }}
                />
                <Text fontSize={14} color={Colors.text} flex={1}>
                  {humanizeSummary(leg.instruction.summary, [from, to])}
                </Text>
              </XStack>
            ))}
          </YStack>
        )}

        {/* End-early affordance, kept distinct from the natural "Arrived — finish" completion. */}
        <YStack
          items="center"
          justify="center"
          py="$2"
          onPress={endJourney}
          pressStyle={{ opacity: Opacity.pressedLight }}
          role="button"
          aria-label="End journey"
        >
          <Text fontSize={14} fontWeight="600" color={Colors.danger}>
            End journey
          </Text>
        </YStack>
      </YStack>
    </FormScreenLayout>
  )
}

const styles = StyleSheet.create({
  controlBar: {
    backgroundColor: Colors.card,
    borderTopWidth: Borders.thin,
    borderTopColor: Colors.border,
  },
  secondaryButton: {
    height: Heights.touchTarget,
    borderRadius: Radii.button,
    borderWidth: Borders.medium,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  primaryButton: {
    height: Heights.touchTarget,
    borderRadius: Radii.button,
    backgroundColor: Colors.blue,
  },
})
