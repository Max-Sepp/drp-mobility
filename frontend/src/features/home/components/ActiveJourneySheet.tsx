// Active journey (turn-by-turn) as a bottom sheet.
// Two snaps:
//   index 0 (~25 % height) — compact: current leg summary only
//   index 1 (~88 % height) — full: all detail, GPS status, upcoming legs, end-journey link
// The Previous / Arrived control bar uses footerComponent so it is pinned to the visible
// bottom of the sheet at all times — it never moves during snap transitions.

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, View } from 'react-native'
import { TouchableOpacity } from 'react-native-gesture-handler'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  BottomSheetBackdrop,
  BottomSheetFooter,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { useStations } from '@/features/stations'
import {
  matchOutages,
  reportsToStationOutages,
  resolveStationName,
} from '@/features/journey/api/accessibility'
import { assessOutages, DIRECT_VERDICTS } from '@/features/journey/api/outageRelevance'
import type { StationOutage } from '@/features/journey/api/accessibility'
import { useOutages } from '@/features/outages'
import { planJourneyOptions, routeSignature, type Journey, type RouteTag } from '@/features/journey/api/tfl'
import type { RerouteState } from '@/features/journey/components/RerouteAlert'
import { JourneyResultCard } from '@/features/journey/components/JourneyResultCard'
import {
  clearActiveJourney,
  loadActiveJourney,
  setActiveLegIndex,
} from '@/features/journey/api/activeJourney'
import {
  clockTime,
  humanizeSummary,
  legLineColor,
  modeIcon,
  STATION_MODES,
  stripStationSuffix,
} from '@/features/journey/components/legDisplay'
import { RouteAlerts } from '@/features/journey/components/RouteAlerts'
import { haversineMeters } from '@/lib/geo'
import type { ActiveJourneyParams } from '@/features/home/components/JourneyDetailSheet'
import { useTheme, Borders, Heights, Opacity, Spacing } from '@/theme'

const ARRIVAL_RADIUS_M = 120
const SCREEN_H = Dimensions.get('window').height
const SNAP_HALF = SCREEN_H * 0.52
// Extra height added to snap 0 when the reroute banner is visible in the footer.
const REROUTE_BANNER_H = 56

type Props = {
  params: ActiveJourneyParams | null
  onComplete: () => void
  onEnd: () => void
  onStationPress?: (station: string) => void
  onHeightChange?: (height: number) => void
}

export function ActiveJourneySheet({
  params,
  onComplete,
  onEnd,
  onStationPress,
  onHeightChange,
}: Props) {
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
        // RNGH touchables render an outer BaseButton (containerStyle) wrapping an inner
        // Animated.View (style). Flex sizing must go on the outer container or the button
        // hugs its content; the visual styling stays inner so the opacity animation fades it.
        secondaryBtnOuter: { flex: 1 },
        primaryBtnOuter: { flex: 1.4 },
        secondaryBtn: {
          height: Heights.touchTarget,
          borderRadius: Radii.button,
          borderWidth: Borders.medium,
          borderColor: Colors.border,
          backgroundColor: Colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        primaryBtn: {
          height: Heights.touchTarget,
          borderRadius: Radii.button,
          backgroundColor: Colors.blue,
          alignItems: 'center',
          justifyContent: 'center',
        },
        rerouteBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        rerouteSheetBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          height: Heights.button,
          borderRadius: Radii.button,
          gap: 8,
        },
      }),
    [Colors, Radii],
  )
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetRef>(null)
  const rerouteSheetRef = useRef<BottomSheetRef>(null)

  const [legIndex, setLegIndex] = useState(0)
  const [snapIndex, setSnapIndex] = useState(1)
  const [gpsActive, setGpsActive] = useState(false)
  const [currentJourney, setCurrentJourney] = useState<Journey | null>(null)
  const [rerouteState, setRerouteState] = useState<RerouteState>({ phase: 'idle' })
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
    setCurrentJourney(null)
    setRerouteState({ phase: 'idle' })
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

  const legs = useMemo(
    () => (currentJourney ?? params?.journey)?.legs ?? [],
    [currentJourney, params],
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

  const legIndexRef = useRef(legIndex)
  const goToRef = useRef(goTo)
  useEffect(() => {
    legIndexRef.current = legIndex
    goToRef.current = goTo
  }, [legIndex, goTo])

  const { reports } = useOutages()
  const allOutages = useMemo(() => reportsToStationOutages(reports), [reports])

  const outageAssessments = useMemo(() => {
    const journey = currentJourney ?? params?.journey
    if (!journey) return []
    // Fall back to the snapshot captured at journey start until the SSE feed has data
    const matched =
      allOutages.length > 0
        ? matchOutages(journey, allOutages)
        : matchOutages(journey, params?.outages ?? [])
    return assessOutages(journey, matched, stations)
  }, [currentJourney, params?.journey, allOutages, params?.outages, stations])

  const arrivalStation = currentLeg?.arrivalPoint?.commonName
    ? resolveStation(currentLeg.arrivalPoint.commonName)
    : null
  const upcomingAssessments = useMemo(
    () => (arrivalStation ? outageAssessments.filter((a) => a.stationName === arrivalStation) : []),
    [arrivalStation, outageAssessments],
  )

  // All station names the rider still needs to pass through (arrival of current leg onwards).
  const futureStationNames = useMemo(() => {
    const names = new Set<string>()
    for (let i = legIndex; i < legs.length; i++) {
      const arrCommon = legs[i].arrivalPoint?.commonName
      if (arrCommon) {
        const resolved = resolveStation(arrCommon)
        if (resolved) names.add(resolved)
      }
    }
    return names
  }, [legs, legIndex, resolveStation])

  // Outage assessments at future stations that carry a direct-verdict unit — these justify
  // offering a reroute.
  const upcomingBlockedAssessments = useMemo(
    () =>
      outageAssessments.filter(
        (a) =>
          a.role !== 'unknown' &&
          futureStationNames.has(a.stationName) &&
          a.units.some((u) => DIRECT_VERDICTS.has(u.verdict)),
      ),
    [outageAssessments, futureStationNames],
  )

  // Destination for the reroute planner: prefer the stored postcode, fall back to the
  // last leg's arrival coordinates (TfL accepts both formats).
  const rerouteToLocation = useMemo(() => {
    if (params?.to?.postcode) return params.to.postcode
    const lastLeg = legs[legs.length - 1]
    const arr = lastLeg?.arrivalPoint
    return arr?.lat != null && arr?.lon != null ? `${arr.lat},${arr.lon}` : null
  }, [params?.to?.postcode, legs])

  const showRerouteAlert = useMemo(
    () => upcomingBlockedAssessments.length > 0 && rerouteToLocation != null,
    [upcomingBlockedAssessments, rerouteToLocation],
  )

  const rerouteBannerText =
    upcomingBlockedAssessments.length === 1
      ? `Reroute around ${upcomingBlockedAssessments[0].stationName}?`
      : `Find alternative routes?`

  const rerouteBodyText = useMemo(() => {
    if (upcomingBlockedAssessments.length === 1) {
      const a = upcomingBlockedAssessments[0]
      const types = [...new Set(a.units.map((u) => u.equipmentType))]
      const equipment = types.length === 1 ? types[0] : 'step-free equipment'
      return `A ${equipment} at ${a.stationName} is reported out of service on this route.`
    }
    const names = upcomingBlockedAssessments.map((a) => a.stationName)
    const listed =
      names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    return `Step-free access issues reported at ${listed}.`
  }, [upcomingBlockedAssessments])

  // Three snaps: compact (handle + summary row + optional banner + footer), half-screen, near-full.
  // Banner height is only added when an accessibility alert is active, so snap 0 grows dynamically.
  // Footer = paddingTop 8 + button 48 + border 1 + paddingBottom 8 + insets.bottom = 65 + insets.bottom.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const snapPoints = useMemo(
    () => [
      24 + 58 + (showRerouteAlert ? REROUTE_BANNER_H : 0) + 65 + insets.bottom,
      SNAP_HALF,
      SCREEN_H - insets.top - 66,
    ],
    [insets.top, insets.bottom, showRerouteAlert],
  )

  const rerouteSnapPoints = useMemo(() => [SCREEN_H * 0.55], [])

  // Close and reset the reroute sheet when the blocking outages resolve or all
  // affected stations have been passed.
  useEffect(() => {
    if (!showRerouteAlert) {
      rerouteSheetRef.current?.close()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRerouteState({ phase: 'idle' })
    }
  }, [showRerouteAlert])

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

  async function handleFindAlternative() {
    if (!params) return
    setRerouteState({ phase: 'loading' })

    const activeLegs = (currentJourney ?? params.journey).legs
    const dep = activeLegs[legIndex]?.departurePoint
    // Always reroute from the current leg's departure point (where the user is now),
    // never from the original starting point.
    const fromLocation =
      dep?.lat != null && dep?.lon != null ? `${dep.lat},${dep.lon}` : null
    const toLocation = rerouteToLocation

    if (!fromLocation || !toLocation) {
      setRerouteState({ phase: 'none-found' })
      return
    }

    const result = await planJourneyOptions(fromLocation, toLocation, params.level, null, true)

    if (result.kind !== 'journeys') {
      setRerouteState({ phase: 'none-found' })
      return
    }

    const blockedAsOutages: StationOutage[] = upcomingBlockedAssessments.map((a) => ({
      stationName: a.stationName,
      equipmentTypes: [],
      units: [],
    }))

    const baseSig = routeSignature(currentJourney ?? params.journey)
    const alternatives = result.journeys.filter(
      ({ journey }) =>
        routeSignature(journey) !== baseSig &&
        matchOutages(journey, blockedAsOutages).length === 0,
    )

    setRerouteState(
      alternatives.length > 0 ? { phase: 'found', alternatives } : { phase: 'none-found' },
    )
  }

  function handleSelectAlternative(journey: Journey, _tags: RouteTag[]) {
    setCurrentJourney(journey)
    setLegIndex(0)
    setRerouteState({ phase: 'idle' })
    autoAdvancedFromRef.current = null
    rerouteSheetRef.current?.close()
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

  // Semi-transparent backdrop for the reroute sheet; tapping it closes the sheet.
  const rerouteBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={0.4}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    [],
  )

  // footerComponent pins the reroute alert banner (if active) + Previous/Arrived controls
  // to the visible bottom of the sheet at all times.
  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        {showRerouteAlert && (
          <TouchableOpacity
            style={[
              styles.rerouteBanner,
              {
                backgroundColor: Colors.warningBg,
                borderTopColor: Colors.warningBorder,
                borderBottomColor: Colors.warningBorder,
              },
            ]}
            onPress={() => rerouteSheetRef.current?.snapToIndex(0)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Accessibility issue ahead — tap to find alternative route"
          >
            <MaterialIcons name="warning-amber" size={16} color={Colors.warningDark} />
            <Text
              fontSize={13}
              fontWeight="600"
              color={Colors.warningDark}
              style={{ flex: 1 }}
              numberOfLines={1}
            >
              {rerouteBannerText}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color={Colors.warningDark} />
          </TouchableOpacity>
        )}
        <View style={[styles.controlBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <TouchableOpacity
            containerStyle={styles.secondaryBtnOuter}
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
            containerStyle={styles.primaryBtnOuter}
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
    [showRerouteAlert, rerouteBannerText, legIndex, isFinalLeg, goTo, onArrived, insets, Colors, styles],
  )

  if (!params) {
    return (
      <>
        <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} onChange={handleChange}>
          {null}
        </BottomSheet>
        <BottomSheet
          ref={rerouteSheetRef}
          index={-1}
          snapPoints={rerouteSnapPoints}
          backdropComponent={rerouteBackdrop}
          enablePanDownToClose
          onChange={() => {}}
        >
          {null}
        </BottomSheet>
      </>
    )
  }

  if (!currentLeg) {
    return (
      <>
        <BottomSheet ref={sheetRef} index={-1} snapPoints={snapPoints} onChange={handleChange}>
          <YStack flex={1} items="center" justify="center" gap="$3">
            <Spinner color={Colors.blue} />
            <Text fontSize={15} color={Colors.secondaryText}>
              Loading your journey…
            </Text>
          </YStack>
        </BottomSheet>
        <BottomSheet
          ref={rerouteSheetRef}
          index={-1}
          snapPoints={rerouteSnapPoints}
          backdropComponent={rerouteBackdrop}
          enablePanDownToClose
          onChange={() => {}}
        >
          {null}
        </BottomSheet>
      </>
    )
  }

  const { from, to } = params
  const lineColor = legLineColor(currentLeg, Colors.blue)
  const isWalking = currentLeg.mode.name === 'walking'
  const isBus = currentLeg.mode.name === 'bus' || currentLeg.mode.name === 'coach'
  const accentBg = isWalking ? Colors.searchBg : lineColor
  const accentFg = isWalking ? Colors.secondaryText : 'white'

  const routeName = currentLeg.routeOptions?.[0]?.name ?? null
  const direction = currentLeg.routeOptions?.[0]?.directions?.find(Boolean) ?? null

  const depCommon = currentLeg.departurePoint?.commonName
  const arrCommon = currentLeg.arrivalPoint?.commonName
  const depName = depCommon ? stripStationSuffix(depCommon) : null
  const arrName = arrCommon ? stripStationSuffix(arrCommon) : null
  const depResolved = depCommon ? resolveStation(depCommon) : null
  const arrResolved = arrCommon ? resolveStation(arrCommon) : null
  const depTime = currentLeg.departureTime ? clockTime(currentLeg.departureTime) : null
  const arrTime = currentLeg.arrivalTime ? clockTime(currentLeg.arrivalTime) : null

  const detailed =
    currentLeg.instruction.detailed &&
    currentLeg.instruction.detailed !== currentLeg.instruction.summary
      ? currentLeg.instruction.detailed
      : null
  const headerColor = isWalking ? Colors.secondaryText : lineColor
  const remaining = legs.slice(legIndex + 1)
  const isExpanded = snapIndex >= 1
  const hasStations = STATION_MODES.has(currentLeg.mode.name) && !!(depName || arrName)

  return (
    <>
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
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: accentBg,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: Spacing.sm,
            flexShrink: 0,
          }}
        >
          <MaterialIcons name={modeIcon(currentLeg.mode.name)} size={20} color={accentFg} />
        </View>
        <YStack flex={1} gap="$1">
          <Text fontSize={19} fontWeight="700" color={Colors.text} numberOfLines={1}>
            {arrName ?? humanizeSummary(currentLeg.instruction.summary, [from, to])}
          </Text>
          {routeName && !isWalking ? (
            <View
              style={{
                alignSelf: 'flex-start',
                backgroundColor: isBus ? Colors.searchBg : accentBg,
                borderRadius: Radii.xs,
                paddingHorizontal: 6,
                paddingVertical: 1,
                borderWidth: isBus ? Borders.thin : 0,
                borderColor: isBus ? Colors.border : undefined,
              }}
            >
              <Text
                fontSize={12}
                fontWeight="700"
                style={{ color: isBus ? Colors.text : accentFg }}
              >
                {routeName}
              </Text>
            </View>
          ) : isWalking ? (
            <Text fontSize={13} color={Colors.secondaryText}>
              {currentLeg.duration} min walk
            </Text>
          ) : null}
        </YStack>
        {arrTime && (
          <Text
            fontSize={16}
            fontWeight="700"
            color={Colors.text}
            style={{ marginRight: isExpanded ? 0 : Spacing.xs }}
          >
            {arrTime}
          </Text>
        )}
        {!isExpanded && <MaterialIcons name="expand-less" size={20} color={Colors.secondaryText} />}
      </TouchableOpacity>

      {/* Full detail — always rendered so content slides in during snap transition */}
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: 65 + insets.bottom + Spacing.xl }]}
      >
        <YStack gap="$3">
          {/* Heading: live indicator + leg progress */}
          <XStack items="center" justify="space-between">
            <XStack items="center" gap="$1.5">
              <View
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: headerColor }}
              />
              <Text fontSize={13} fontWeight="700" style={{ color: headerColor }}>
                NOW
              </Text>
            </XStack>
            <Text fontSize={12} color={Colors.secondaryText}>
              Leg {legIndex + 1} of {legs.length}
            </Text>
          </XStack>

          {/* Current leg card */}
          <View
            style={{
              borderRadius: Radii.button,
              overflow: 'hidden',
              backgroundColor: Colors.card,
              borderWidth: Borders.thin,
              borderColor: Colors.border,
            }}
          >
            {/* Line-colour accent strip */}
            <View style={{ height: 5, backgroundColor: accentBg }} />

            <YStack p="$5" gap="$4">
              {/* Mode circle + line badge + direction */}
              <XStack items="center" gap="$2.5">
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: accentBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MaterialIcons
                    name={modeIcon(currentLeg.mode.name)}
                    size={20}
                    color={accentFg}
                    aria-label={currentLeg.mode.name}
                  />
                </View>
                {routeName && !isWalking && (
                  <View
                    style={{
                      backgroundColor: isBus ? Colors.searchBg : accentBg,
                      borderRadius: Radii.xs,
                      paddingHorizontal: 10,
                      paddingVertical: 4,
                      borderWidth: isBus ? Borders.thin : 0,
                      borderColor: isBus ? Colors.border : undefined,
                      flexShrink: 0,
                    }}
                  >
                    <Text
                      fontSize={15}
                      fontWeight="700"
                      style={{ color: isBus ? Colors.text : 'white' }}
                    >
                      {routeName}
                    </Text>
                  </View>
                )}
                {direction && (
                  <Text
                    fontSize={14}
                    color={Colors.secondaryText}
                    numberOfLines={1}
                    style={{ flex: 1 }}
                  >
                    {'→ '}
                    {stripStationSuffix(direction)}
                  </Text>
                )}
                {isWalking && (
                  <Text fontSize={16} fontWeight="600" color={Colors.text}>
                    Walk · {currentLeg.duration} min
                  </Text>
                )}
              </XStack>

              {/* Transit legs: vertical station connector */}
              {hasStations ? (
                <View>
                  {/* Departure — dot is in the same row as the chip, so alignItems:'center'
                      guarantees the dot always centres on the station label regardless of chip height */}
                  {depName && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 20, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 11,
                            height: 11,
                            borderRadius: 6,
                            borderWidth: 2,
                            borderColor: accentBg,
                            backgroundColor: Colors.card,
                          }}
                        />
                      </View>
                      <View
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        {depResolved ? (
                          <TouchableOpacity
                            onPress={() => onStationPress?.(depResolved)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`View accessibility for ${depResolved}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              borderRadius: Radii.small,
                              borderWidth: Borders.thin,
                              borderColor: accentBg,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                            }}
                          >
                            <Text
                              fontSize={16}
                              fontWeight="600"
                              style={{ flexShrink: 1, color: accentBg }}
                              numberOfLines={1}
                            >
                              {depName}
                            </Text>
                            <MaterialIcons name="chevron-right" size={16} color={accentBg} />
                          </TouchableOpacity>
                        ) : (
                          <Text
                            fontSize={16}
                            fontWeight="600"
                            color={Colors.text}
                            numberOfLines={1}
                          >
                            {depName}
                          </Text>
                        )}
                        {depTime && (
                          <Text fontSize={15} fontWeight="600" color={Colors.secondaryText}>
                            {depTime}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Connector + duration — gutter stretches to this row's height */}
                  <View style={{ flexDirection: 'row' }}>
                    <View style={{ width: 20, alignItems: 'center' }}>
                      <View
                        style={{ flex: 1, width: 2, backgroundColor: accentBg, opacity: 0.35 }}
                      />
                    </View>
                    <XStack items="center" gap="$1.5" py="$2" style={{ paddingLeft: Spacing.sm }}>
                      <MaterialIcons name="schedule" size={13} color={Colors.tertiaryText} />
                      <Text fontSize={13} color={Colors.tertiaryText}>
                        {currentLeg.duration} min
                      </Text>
                    </XStack>
                  </View>

                  {/* Arrival — same inline-dot pattern */}
                  {arrName && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 20, alignItems: 'center' }}>
                        <View
                          style={{
                            width: 11,
                            height: 11,
                            borderRadius: 6,
                            backgroundColor: accentBg,
                          }}
                        />
                      </View>
                      <View
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        {arrResolved ? (
                          <TouchableOpacity
                            onPress={() => onStationPress?.(arrResolved)}
                            activeOpacity={0.7}
                            accessibilityRole="button"
                            accessibilityLabel={`View accessibility for ${arrResolved}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              borderRadius: Radii.small,
                              borderWidth: Borders.thin,
                              borderColor: accentBg,
                              paddingHorizontal: 8,
                              paddingVertical: 5,
                            }}
                          >
                            <Text
                              fontSize={16}
                              fontWeight="600"
                              style={{ flexShrink: 1, color: accentBg }}
                              numberOfLines={1}
                            >
                              {arrName}
                            </Text>
                            <MaterialIcons name="chevron-right" size={16} color={accentBg} />
                          </TouchableOpacity>
                        ) : (
                          <Text
                            fontSize={16}
                            fontWeight="600"
                            color={Colors.text}
                            numberOfLines={1}
                          >
                            {arrName}
                          </Text>
                        )}
                        {arrTime && (
                          <Text fontSize={15} fontWeight="600" color={Colors.secondaryText}>
                            {arrTime}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              ) : (
                /* Walking / bus / other: instruction text + times */
                <YStack gap="$2">
                  {!isWalking && (
                    <Text fontSize={16} fontWeight="600" color={Colors.text}>
                      {humanizeSummary(currentLeg.instruction.summary, [from, to])}
                    </Text>
                  )}
                  {detailed && (
                    <Text fontSize={14} color={Colors.secondaryText}>
                      {humanizeSummary(detailed, [from, to])}
                    </Text>
                  )}
                  {(depTime || arrTime) && (
                    <XStack items="center" gap="$1.5" mt="$0.5">
                      <MaterialIcons name="schedule" size={14} color={Colors.secondaryText} />
                      <Text fontSize={14} color={Colors.secondaryText}>
                        {[depTime, arrTime].filter(Boolean).join(' → ')} · {currentLeg.duration} min
                      </Text>
                    </XStack>
                  )}
                </YStack>
              )}
            </YStack>
          </View>

          {/* GPS status */}
          <XStack items="center" gap="$2">
            <MaterialIcons
              name={gpsActive ? 'my-location' : 'location-disabled'}
              size={15}
              color={Colors.secondaryText}
            />
            <Text fontSize={12} color={Colors.secondaryText} flex={1}>
              {gpsActive
                ? 'Advancing automatically as you arrive — or tap Arrived.'
                : 'Tap Arrived when you reach each stop.'}
            </Text>
          </XStack>

          <RouteAlerts assessments={upcomingAssessments} disruptions={[]} />

          {remaining.length > 0 && (
            <YStack gap="$1.5">
              <Text
                fontSize={11}
                fontWeight="700"
                color={Colors.tertiaryText}
                style={{ letterSpacing: 0.5 }}
              >
                COMING UP
              </Text>
              {remaining.map((leg, i) => {
                const legColor = legLineColor(leg, Colors.blue)
                const legIsWalking = leg.mode.name === 'walking'
                const legIsBus = leg.mode.name === 'bus' || leg.mode.name === 'coach'
                const legBg = legIsWalking ? Colors.searchBg : legColor
                const legFg = legIsWalking ? Colors.secondaryText : 'white'
                const legRouteName = leg.routeOptions?.[0]?.name ?? null
                const legArrCommon = leg.arrivalPoint?.commonName
                const legArrName = legArrCommon ? stripStationSuffix(legArrCommon) : null
                const legArrTime = leg.arrivalTime ? clockTime(leg.arrivalTime) : null
                return (
                  <XStack
                    key={legIndex + 1 + i}
                    gap="$2.5"
                    items="center"
                    py="$1"
                    opacity={Opacity.subtle}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: legBg,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <MaterialIcons name={modeIcon(leg.mode.name)} size={15} color={legFg} />
                    </View>
                    {legRouteName && !legIsWalking && (
                      <View
                        style={{
                          backgroundColor: legIsBus ? Colors.searchBg : legBg,
                          borderRadius: Radii.xs,
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderWidth: legIsBus ? Borders.thin : 0,
                          borderColor: legIsBus ? Colors.border : undefined,
                          flexShrink: 0,
                        }}
                      >
                        <Text
                          fontSize={11}
                          fontWeight="700"
                          style={{ color: legIsBus ? Colors.text : legFg }}
                        >
                          {legRouteName}
                        </Text>
                      </View>
                    )}
                    <Text fontSize={13} color={Colors.text} flex={1} numberOfLines={1}>
                      {legArrName ?? humanizeSummary(leg.instruction.summary, [from, to])}
                    </Text>
                    {legArrTime && (
                      <Text fontSize={13} color={Colors.secondaryText}>
                        {legArrTime}
                      </Text>
                    )}
                  </XStack>
                )
              })}
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

    {/* Reroute sheet — rendered after main sheet so it sits on top (higher z-order). */}
    <BottomSheet
      ref={rerouteSheetRef}
      index={-1}
      snapPoints={rerouteSnapPoints}
      backdropComponent={rerouteBackdrop}
      enablePanDownToClose
      onChange={() => {}}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: Spacing.lg,
          paddingBottom: insets.bottom + Spacing.xl,
        }}
      >
        <YStack gap="$4" pt="$2">
          {/* Header */}
          <XStack gap="$2" items="flex-start">
            <MaterialIcons
              name="warning-amber"
              size={18}
              color={Colors.warningDark}
              style={{ marginTop: 1 }}
            />
            <YStack flex={1} gap="$1">
              <Text fontSize={15} fontWeight="700" color={Colors.warningDark}>
                Accessibility issue on your route
              </Text>
              <Text fontSize={13} color={Colors.secondaryText}>
                {rerouteBodyText}
              </Text>
            </YStack>
          </XStack>

          {/* Find alternative / loading */}
          {(rerouteState.phase === 'idle' || rerouteState.phase === 'loading') && (
            <TouchableOpacity
              style={[
                styles.rerouteSheetBtn,
                {
                  backgroundColor:
                    rerouteState.phase === 'loading' ? Colors.warningBorder : Colors.warningDark,
                  opacity: rerouteState.phase === 'loading' ? Opacity.disabledMid : 1,
                },
              ]}
              onPress={rerouteState.phase === 'loading' ? undefined : handleFindAlternative}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Find alternative route"
            >
              {rerouteState.phase === 'loading' ? (
                <Spinner size="small" color="white" />
              ) : (
                <MaterialIcons name="alt-route" size={16} color="white" />
              )}
              <Text fontSize={14} fontWeight="700" color="white">
                {rerouteState.phase === 'loading' ? 'Searching…' : 'Find alternative route'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Alternative routes list */}
          {rerouteState.phase === 'found' && (
            <YStack gap="$2">
              <Text
                fontSize={11}
                fontWeight="700"
                color={Colors.tertiaryText}
                style={{ letterSpacing: 0.5 }}
              >
                ALTERNATIVE ROUTES
              </Text>
              {rerouteState.alternatives.map(({ journey, tags }, i) => (
                <JourneyResultCard
                  key={i}
                  journey={journey}
                  tags={tags}
                  onPress={() => handleSelectAlternative(journey, tags)}
                />
              ))}
            </YStack>
          )}

          {/* No alternatives found */}
          {rerouteState.phase === 'none-found' && (
            <XStack gap="$2" items="flex-start">
              <MaterialIcons
                name="info-outline"
                size={16}
                color={Colors.secondaryText}
                style={{ marginTop: 1 }}
              />
              <Text fontSize={13} color={Colors.secondaryText} flex={1}>
                No accessible alternative routes were found for this journey.
              </Text>
            </XStack>
          )}
        </YStack>
      </BottomSheetScrollView>
    </BottomSheet>
    </>
  )
}
