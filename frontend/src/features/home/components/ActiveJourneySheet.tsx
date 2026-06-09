// Active journey (turn-by-turn) as a bottom sheet.
// Two snaps:
//   index 0 (~25 % height) — compact: current leg summary only
//   index 1 (~88 % height) — full: all detail, GPS status, upcoming legs, end-journey link
// The Previous / Arrived control bar uses footerComponent so it is pinned to the visible
// bottom of the sheet at all times — it never moves during snap transitions.

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { useStations } from '@/features/stations'
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
import type { RootStackParamList } from '@/navigation/types'
import type { ActiveJourneyParams } from '@/features/home/components/JourneyDetailSheet'
import { useTheme, Borders, Heights, Opacity, Spacing } from '@/theme'

const ARRIVAL_RADIUS_M = 120
const SCREEN_H = Dimensions.get('window').height
const SNAP_HALF = SCREEN_H * 0.52

type Props = {
  params: ActiveJourneyParams | null
  onComplete: () => void
  onEnd: () => void
  onHeightChange?: (height: number) => void
}

export function ActiveJourneySheet({ params, onComplete, onEnd, onHeightChange }: Props) {
  const { Colors, Radii } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        compactRow: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
        },
        content: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xs,
          paddingBottom: Spacing.lg,
        },
        controlBar: {
          flexDirection: 'row',
          gap: Spacing.md,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Colors.border,
          backgroundColor: Colors.card,
        },
        secondaryBtn: {
          flex: 1,
          height: Heights.touchTarget,
          borderRadius: Radii.button,
          borderWidth: Borders.medium,
          borderColor: Colors.border,
          backgroundColor: Colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        primaryBtn: {
          flex: 1.4,
          height: Heights.touchTarget,
          borderRadius: Radii.button,
          backgroundColor: Colors.blue,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [Colors, Radii],
  )
  const insets = useSafeAreaInsets()
  // Three snaps: compact (handle + summary row + footer), half-screen, near-full.
  // Handle is 24 px (gorhom default). Summary row has no paddingTop, paddingBottom 12, two text
  // lines ~38 px, so ~50 px total. Footer = paddingTop 8 + button 48 + border 1 + paddingBottom 8
  // + insets.bottom = 65 + insets.bottom. Tight fit leaves no gap for scroll content to bleed through.
  // Full snap matches other sheets: SCREEN_H - insets.top - 66, clearing the top nav buttons.
  const snapPoints = useMemo(
    () => [24 + 47 + 65 + insets.bottom, SNAP_HALF, SCREEN_H - insets.top - 66],
    [insets.top, insets.bottom],
  )
  const sheetRef = useRef<BottomSheetRef>(null)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const [legIndex, setLegIndex] = useState(0)
  const [snapIndex, setSnapIndex] = useState(1)
  const [gpsActive, setGpsActive] = useState(false)
  const autoAdvancedFromRef = useRef<number | null>(null)

  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const resolveStation = useCallback(
    (name: string) => resolveStationName(name, stationNames),
    [stationNames],
  )

  useEffect(() => {
    if (!params) {
      sheetRef.current?.close()
      return
    }
    sheetRef.current?.snapToIndex(0)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnapIndex(0)
    setLegIndex(0)
    setGpsActive(false)
    autoAdvancedFromRef.current = null

    let active = true
    loadActiveJourney().then((record) => {
      if (active && record && record.savedId === params.savedId) {
        setLegIndex(record.currentLegIndex)
      }
    })
    return () => {
      active = false
    }
  }, [params])

  function handleChange(index: number) {
    setSnapIndex(index)
    onHeightChange?.(index >= 0 ? snapPoints[index] : 0)
    if (index === -1) onEnd()
  }

  const legs = useMemo(() => params?.journey.legs ?? [], [params])
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

  const legIndexRef = useRef(legIndex)
  const goToRef = useRef(goTo)
  useEffect(() => {
    legIndexRef.current = legIndex
    goToRef.current = goTo
  }, [legIndex, goTo])

  const outageAssessments = useMemo(
    () => (params ? assessOutages(params.journey, params.outages ?? [], stations) : []),
    [params, stations],
  )

  const arrivalStation = currentLeg?.arrivalPoint?.commonName
    ? resolveStation(currentLeg.arrivalPoint.commonName)
    : null
  const upcomingAssessments = useMemo(
    () => (arrivalStation ? outageAssessments.filter((a) => a.stationName === arrivalStation) : []),
    [arrivalStation, outageAssessments],
  )

  useEffect(() => {
    if (!params) return
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
  }, [params, legs])

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
            sheetRef.current?.close()
          },
        },
      ],
    )
  }

  const onArrived = useCallback(() => {
    if (isFinalLeg) {
      void clearActiveJourney().then(() => {
        Alert.alert('Journey complete', 'You have arrived. Safe travels!', [
          { text: 'Done', onPress: onComplete },
        ])
      })
    } else {
      goTo(legIndex + 1)
    }
  }, [isFinalLeg, goTo, legIndex, onComplete])

  // Tapping above collapses to snap 0; sheet cannot be dragged below snap 0.
  const collapseBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={0}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="collapse"
      />
    ),
    [],
  )

  // footerComponent pins Previous/Arrived to the visible bottom of the sheet
  // regardless of which snap point is active.
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View style={[styles.controlBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <TouchableOpacity
            style={[styles.secondaryBtn, legIndex === 0 && { opacity: Opacity.disabled }]}
            onPress={legIndex === 0 ? undefined : () => goTo(legIndex - 1)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Previous leg"
          >
            <Text fontSize={16} fontWeight="700" color={Colors.text}>
              Previous
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onArrived}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isFinalLeg ? 'Arrived, finish journey' : 'Arrived, go to next leg'}
          >
            <XStack items="center" gap="$2">
              <MaterialIcons name="check-circle" size={20} color={Colors.card} />
              <Text fontSize={16} fontWeight="700" color={Colors.card}>
                {isFinalLeg ? 'Arrived — finish' : 'Arrived — next leg'}
              </Text>
            </XStack>
          </TouchableOpacity>
        </View>
      </BottomSheetFooter>
    ),
    [legIndex, isFinalLeg, goTo, onArrived, insets, Colors, styles],
  )

  if (!params) {
    return (
      <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} onChange={handleChange}>
        {null}
      </BottomSheet>
    )
  }

  if (!currentLeg) {
    return (
      <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} onChange={handleChange}>
        <YStack flex={1} items="center" justify="center" gap="$3">
          <Spinner color={Colors.blue} />
          <Text fontSize={15} color={Colors.secondaryText}>
            Loading your journey…
          </Text>
        </YStack>
      </BottomSheet>
    )
  }

  const { from, to } = params
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
  const isExpanded = snapIndex >= 1

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={false}
      backdropComponent={collapseBackdrop}
      footerComponent={renderFooter}
      onChange={handleChange}
    >
      {/* Compact summary row — always visible */}
      <TouchableOpacity
        style={styles.compactRow}
        onPress={isExpanded ? undefined : () => sheetRef.current?.snapToIndex(1)}
        activeOpacity={isExpanded ? 1 : 0.7}
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? undefined : 'Expand journey details'}
      >
        <MaterialIcons
          name={modeIcon(currentLeg.mode.name)}
          size={22}
          color={Colors.blue}
          style={{ marginRight: Spacing.sm }}
        />
        <YStack flex={1}>
          <Text fontSize={15} fontWeight="700" color={Colors.text} numberOfLines={1}>
            {humanizeSummary(currentLeg.instruction.summary, [from, to])}
          </Text>
          <Text fontSize={12} color={Colors.secondaryText}>
            Leg {legIndex + 1} of {legs.length}
          </Text>
        </YStack>
        {!isExpanded && <MaterialIcons name="expand-less" size={20} color={Colors.secondaryText} />}
      </TouchableOpacity>

      {/* Full detail — always rendered so content slides in during snap transition */}
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: 65 + insets.bottom + Spacing.xl }]}
      >
        <YStack gap="$4">
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
              onStationPress={(s) => navigation.navigate('Station', { station: s })}
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

          <OutageDetail assessments={upcomingAssessments} />

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
      </BottomSheetScrollView>
    </BottomSheet>
  )
}
