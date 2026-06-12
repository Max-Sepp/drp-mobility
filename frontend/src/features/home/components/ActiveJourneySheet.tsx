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
import { SheetHeader } from '@/components/SheetHeader'
import {
  JourneyDetailSheet,
  type ActiveJourneyParams,
  type JourneyDetailParams,
} from '@/features/home/components/JourneyDetailSheet'
import { useStations } from '@/features/stations'
import {
  matchOutages,
  reportsToStationOutages,
  resolveStationName,
} from '@/features/journey/api/accessibility'
import { assessOutages, DIRECT_VERDICTS } from '@/features/journey/api/outageRelevance'
import type { StationOutage } from '@/features/journey/api/accessibility'
import { useOutages } from '@/features/outages'
import {
  planAlternativesAlongLine,
  planJourneyOptions,
  routeSignature,
  type Journey,
  type RouteTag,
  type TaggedJourney,
} from '@/features/journey/api/tfl'
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
import { useTheme, Borders, Heights, Opacity, Spacing } from '@/theme'
import { JOURNEY_CACHE_TTL_MS } from '@/config'
import { useSheetStack } from '@/components/SheetStack'

const ARRIVAL_RADIUS_M = 120
const SCREEN_H = Dimensions.get('window').height
const SNAP_HALF = SCREEN_H * 0.52
// Extra height added to snap 0 when the reroute banner is visible in the footer.
const REROUTE_BANNER_H = 72

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
          paddingVertical: Spacing.lg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        rerouteSheetBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: Radii.button,
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        },
      }),
    [Colors, Radii],
  )
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetRef>(null)
  const rerouteSheetRef = useRef<BottomSheetRef>(null)
  const alternativesSheetRef = useRef<BottomSheetRef>(null)

  const [legIndex, setLegIndex] = useState(0)
  const [snapIndex, setSnapIndex] = useState(1)
  const [gpsActive, setGpsActive] = useState(false)
  const [currentJourney, setCurrentJourney] = useState<Journey | null>(null)
  const [rerouteState, setRerouteState] = useState<RerouteState>({ phase: 'idle' })
  const [loadingSource, setLoadingSource] = useState<'from-location' | 'along-line' | null>(null)
  const [alongLineHint, setAlongLineHint] = useState(false)
  const [previewJourney, setPreviewJourney] = useState<JourneyDetailParams | null>(null)
  const [rerouteHeaderH, setRerouteHeaderH] = useState(0)
  const [rerouteResultsH, setRerouteResultsH] = useState<number | null>(null)
  const autoAdvancedFromRef = useRef<number | null>(null)
  const alternativesCacheRef = useRef<{ alternatives: TaggedJourney[]; fetchedAt: number } | null>(
    null,
  )

  const { register, push, onClosed, dismissAll } = useSheetStack()

  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const resolveStation = useCallback(
    (name: string) => resolveStationName(name, stationNames),
    [stationNames],
  )

  // Register both reroute sheets with the global sheet stack so push/pop wires them together.
  useEffect(() => {
    const unregIssues = register(
      'reroute-issues',
      () => rerouteSheetRef.current?.snapToIndex(0),
      () => rerouteSheetRef.current?.close(),
    )
    const unregAlts = register(
      'reroute-alternatives',
      () => alternativesSheetRef.current?.snapToIndex(0),
      () => alternativesSheetRef.current?.close(),
    )
    return () => {
      unregIssues()
      unregAlts()
    }
  }, [register])

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
    alternativesCacheRef.current = null

    let active = true
    loadActiveJourney().then((record) => {
      // Restore stored progress for the journey being resumed. A saved journey matches on
      // savedId; an unsaved one matches when neither side carries a savedId (only one active
      // journey ever exists, so this can't collide with a different route).
      const matchesStored = params.savedId
        ? record?.savedId === params.savedId
        : record != null && !record.savedId
      if (active && record && matchesStored) {
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
  }, [params, legs])

  const showRerouteAlert = useMemo(
    () => upcomingBlockedAssessments.length > 0 && rerouteToLocation != null,
    [upcomingBlockedAssessments, rerouteToLocation],
  )

  const rerouteBannerText = (() => {
    if (upcomingBlockedAssessments.length === 1) {
      const a = upcomingBlockedAssessments[0]
      const types = [
        ...new Set(
          a.units.filter((u) => DIRECT_VERDICTS.has(u.verdict)).map((u) => u.equipmentType),
        ),
      ]
      const equipment =
        types.length === 1 ? types[0].charAt(0).toUpperCase() + types[0].slice(1) : 'Equipment'
      return `${equipment} issue at ${a.stationName}`
    }
    const names = upcomingBlockedAssessments.map((a) => a.stationName)
    return names.length === 2
      ? `Issues at ${names[0]} and ${names[1]}`
      : `Issues at ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  })()

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

  // Issues sheet is fixed height — just RouteAlerts + option buttons footer.
  const rerouteSnapPoints = useMemo(() => [SCREEN_H * 0.78], [])

  // Alternatives sheet resizes dynamically to hug its content.
  const alternativesSnapPoints = useMemo(() => {
    if (rerouteState.phase === 'none-found') return [SCREEN_H * 0.38]
    if (rerouteState.phase === 'found' && rerouteResultsH !== null) {
      const total = rerouteHeaderH + Spacing.xs + rerouteResultsH + Spacing.xl + insets.bottom
      return [Math.min(total, SCREEN_H * 0.88)]
    }
    return [SCREEN_H * 0.55]
  }, [rerouteState.phase, rerouteHeaderH, rerouteResultsH, insets.bottom])

  // Push the alternatives sheet when results arrive; defer 'found' until height is measured.
  useEffect(() => {
    if (rerouteState.phase === 'none-found') push('reroute-alternatives')
  }, [rerouteState.phase, push])

  useEffect(() => {
    if (rerouteState.phase === 'found' && rerouteResultsH !== null) {
      push('reroute-alternatives')
    }
  }, [rerouteState.phase, rerouteResultsH, push])

  // Dismiss all reroute sheets when the blocking outages resolve or are passed.
  useEffect(() => {
    if (!showRerouteAlert) {
      dismissAll()
      alternativesCacheRef.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRerouteState({ phase: 'idle' })
    }
  }, [showRerouteAlert, dismissAll])

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

    // Return cached results immediately if they're still fresh.
    const cached = alternativesCacheRef.current
    if (cached && Date.now() - cached.fetchedAt < JOURNEY_CACHE_TTL_MS) {
      setRerouteState({ phase: 'found', alternatives: cached.alternatives })
      return
    }

    setLoadingSource('from-location')
    setRerouteState({ phase: 'loading' })

    const activeLegs = (currentJourney ?? params.journey).legs
    const dep = activeLegs[legIndex]?.departurePoint
    // Always reroute from the current leg's departure point (where the user is now),
    // never from the original starting point.
    const fromLocation = dep?.lat != null && dep?.lon != null ? `${dep.lat},${dep.lon}` : null
    const toLocation = rerouteToLocation

    if (!fromLocation || !toLocation) {
      setLoadingSource(null)
      setRerouteState({ phase: 'none-found' })
      return
    }

    const result = await planJourneyOptions(fromLocation, toLocation, params.level, null, true)

    setLoadingSource(null)

    if (result.kind !== 'journeys') {
      setRerouteState({ phase: 'none-found' })
      return
    }

    const blockedAsOutages: StationOutage[] = upcomingBlockedAssessments.map((a) => ({
      stationName: a.stationName,
      equipmentTypes: [],
      units: [],
      totalByType: {},
    }))

    const baseSig = routeSignature(currentJourney ?? params.journey)
    const alternatives = result.journeys.filter(
      ({ journey }) =>
        routeSignature(journey) !== baseSig && matchOutages(journey, blockedAsOutages).length === 0,
    )

    if (alternatives.length > 0) {
      alternativesCacheRef.current = { alternatives, fetchedAt: Date.now() }
      setRerouteState({ phase: 'found', alternatives })
    } else {
      setRerouteState({ phase: 'none-found' })
    }
  }

  async function handleFindAlongLine() {
    if (!params) return

    if (currentLeg?.mode.name === 'walking') {
      setAlongLineHint(true)
      return
    }

    setAlongLineHint(false)
    const toLocation = rerouteToLocation
    if (!toLocation) {
      setRerouteState({ phase: 'none-found' })
      return
    }

    setLoadingSource('along-line')
    setRerouteState({ phase: 'loading' })

    const activeLegs = (currentJourney ?? params.journey).legs
    const blockedNames = upcomingBlockedAssessments.map((a) => a.stationName)
    const result = await planAlternativesAlongLine(
      activeLegs,
      legIndex,
      toLocation,
      params.level,
      blockedNames,
    )

    setLoadingSource(null)

    if (result.kind !== 'journeys') {
      setRerouteState({ phase: 'none-found' })
      return
    }

    const baseSig = routeSignature(currentJourney ?? params.journey)
    const blockedAsOutages: StationOutage[] = upcomingBlockedAssessments.map((a) => ({
      stationName: a.stationName,
      equipmentTypes: [],
      units: [],
      totalByType: {},
    }))
    const alternatives = result.journeys.filter(
      ({ journey }) =>
        routeSignature(journey) !== baseSig &&
        matchOutages(journey, blockedAsOutages).length === 0,
    )

    if (alternatives.length > 0) {
      setRerouteState({ phase: 'found', alternatives })
    } else {
      setRerouteState({ phase: 'none-found' })
    }
  }

  function handleSelectAlternative(journey: Journey, _tags: RouteTag[]) {
    setCurrentJourney(journey)
    setLegIndex(0)
    setRerouteState({ phase: 'idle' })
    autoAdvancedFromRef.current = null
    dismissAll()
  }

  function handlePreviewStart(activeParams: ActiveJourneyParams) {
    setPreviewJourney(null)
    handleSelectAlternative(activeParams.journey, [])
  }

  function endJourney() {
    Alert.alert('End journey?', 'This stops following the route.', [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'End journey',
        style: 'destructive',
        onPress: async () => {
          await clearActiveJourney()
          sheetRef.current?.close()
        },
      },
    ])
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
                backgroundColor: Colors.dangerBg,
                borderTopColor: Colors.dangerBorder,
                borderBottomColor: Colors.dangerBorder,
              },
            ]}
            onPress={() => {
              setRerouteState({ phase: 'idle' })
              push('reroute-issues')
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Accessibility issue ahead — tap to find alternative route"
          >
            <MaterialIcons name="error" size={24} color={Colors.dangerDark} />
            <YStack flex={1} gap="$0.5">
              <Text fontSize={14} fontWeight="700" color={Colors.dangerDark} numberOfLines={1}>
                {rerouteBannerText}
              </Text>
              <Text fontSize={12} fontWeight="500" color={Colors.dangerDark}>
                Tap to find an alternative route
              </Text>
            </YStack>
            <MaterialIcons name="chevron-right" size={20} color={Colors.dangerDark} />
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
    [
      showRerouteAlert,
      rerouteBannerText,
      push,
      legIndex,
      isFinalLeg,
      goTo,
      onArrived,
      insets,
      Colors,
      styles,
    ],
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
          enablePanDownToClose
        >
          {null}
        </BottomSheet>
        <BottomSheet
          ref={alternativesSheetRef}
          index={-1}
          snapPoints={[SCREEN_H * 0.55]}
          handleComponent={null}
          enablePanDownToClose
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
          enablePanDownToClose
        >
          {null}
        </BottomSheet>
        <BottomSheet
          ref={alternativesSheetRef}
          index={-1}
          snapPoints={[SCREEN_H * 0.55]}
          handleComponent={null}
          enablePanDownToClose
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

  const routeName = currentLeg.routeOptions?.[0]?.name || null
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
              {isBus && currentLeg.arrivalPoint?.stopLetter
                ? ` (Stop ${currentLeg.arrivalPoint.stopLetter})`
                : ''}
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
          {!isExpanded && (
            <MaterialIcons name="expand-less" size={20} color={Colors.secondaryText} />
          )}
        </TouchableOpacity>

        {/* Full detail — always rendered so content slides in during snap transition */}
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 65 + insets.bottom + Spacing.xl },
          ]}
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
                    {isBus && (depName || arrName) && (
                      <XStack gap="$3" items="center" mt="$0.5">
                        {depName && (
                          <Text
                            fontSize={13}
                            fontWeight="600"
                            color={Colors.text}
                            flex={1}
                            numberOfLines={1}
                          >
                            {depName}
                            {currentLeg.departurePoint?.stopLetter
                              ? ` (Stop ${currentLeg.departurePoint.stopLetter})`
                              : ''}
                          </Text>
                        )}
                        {depName && arrName && (
                          <MaterialIcons
                            name="arrow-forward"
                            size={14}
                            color={Colors.tertiaryText}
                          />
                        )}
                        {arrName && (
                          <Text
                            fontSize={13}
                            fontWeight="600"
                            color={Colors.text}
                            flex={1}
                            numberOfLines={1}
                          >
                            {arrName}
                            {currentLeg.arrivalPoint?.stopLetter
                              ? ` (Stop ${currentLeg.arrivalPoint.stopLetter})`
                              : ''}
                          </Text>
                        )}
                      </XStack>
                    )}
                    {(depTime || arrTime) && (
                      <XStack items="center" gap="$1.5" mt="$0.5">
                        <MaterialIcons name="schedule" size={14} color={Colors.secondaryText} />
                        <Text fontSize={14} color={Colors.secondaryText}>
                          {[depTime, arrTime].filter(Boolean).join(' → ')} · {currentLeg.duration}{' '}
                          min
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
                  const legRouteName = leg.routeOptions?.[0]?.name || null
                  const legArrCommon = leg.arrivalPoint?.commonName
                  const legArrName = legArrCommon ? stripStationSuffix(legArrCommon) : null
                  const legArrStopLetter = legIsBus ? leg.arrivalPoint?.stopLetter : undefined
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
                        {legArrName
                          ? `${legArrName}${legArrStopLetter ? ` (Stop ${legArrStopLetter})` : ''}`
                          : humanizeSummary(leg.instruction.summary, [from, to])}
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

      {/* Issues sheet — modal popup, no handlebar, opens when the banner is tapped. */}
      <BottomSheet
        ref={rerouteSheetRef}
        index={-1}
        snapPoints={rerouteSnapPoints}
        backdropComponent={rerouteBackdrop}
        handleComponent={null}
        enablePanDownToClose
        onChange={(index) => {
          if (index === -1 && onClosed('reroute-issues')) {
            setRerouteState({ phase: 'idle' })
            setAlongLineHint(false)
            alternativesCacheRef.current = null
          }
        }}
      >
        {/* Non-scrollable header: title + reroute action buttons */}
        <SheetHeader
          title="Alternative routes"
          onClose={() => rerouteSheetRef.current?.close()}
          modal
          titleFontSize={22}
        />
        <YStack
          gap="$2"
          px="$4"
          pt="$2"
          style={{
            paddingBottom: Spacing.md,
            zIndex: 1,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: Colors.secondaryText,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.08,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          {(() => {
            const anyBusy = rerouteState.phase === 'loading'
            const busyFromLocation = anyBusy && loadingSource === 'from-location'
            const busyAlongLine = anyBusy && loadingSource === 'along-line'
            return (
              <>
                <TouchableOpacity
                  style={[
                    styles.rerouteSheetBtn,
                    {
                      backgroundColor: busyFromLocation ? Colors.dangerBorder : Colors.dangerDark,
                      opacity: anyBusy ? Opacity.disabledMid : 1,
                    },
                  ]}
                  onPress={anyBusy ? undefined : handleFindAlternative}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Find alternative route from your location"
                >
                  {busyFromLocation ? (
                    <Spinner size="small" color="white" />
                  ) : (
                    <MaterialIcons name="my-location" size={16} color="white" />
                  )}
                  <YStack flex={1}>
                    <Text fontSize={14} fontWeight="700" color="white">
                      {busyFromLocation ? 'Searching…' : 'From your location'}
                    </Text>
                    {!busyFromLocation && (
                      <Text fontSize={12} color="white" style={{ opacity: 0.8 }}>
                        Plan a new route avoiding the issue
                      </Text>
                    )}
                  </YStack>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.rerouteSheetBtn,
                    {
                      backgroundColor: Colors.searchBg,
                      borderWidth: Borders.medium,
                      borderColor: Colors.border,
                      opacity: anyBusy ? Opacity.disabledMid : 1,
                    },
                  ]}
                  onPress={anyBusy ? undefined : handleFindAlongLine}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Find step-free stops along this line"
                >
                  {busyAlongLine ? (
                    <Spinner size="small" color={Colors.text} />
                  ) : (
                      <MaterialIcons name="train" size={16} color={Colors.secondaryText} />
                  )}
                  <YStack flex={1}>
                    <Text fontSize={14} fontWeight="700" color={Colors.text}>
                      {busyAlongLine ? 'Searching…' : 'Along this line'}
                    </Text>
                    {!busyAlongLine && (
                      <Text fontSize={12} color={Colors.secondaryText}>
                        Find step-free stops you can reach from here
                      </Text>
                    )}
                  </YStack>
                </TouchableOpacity>

                {alongLineHint && (
                  <XStack
                    gap="$2"
                    px="$1"
                    pt="$1"
                    pb="$1"
                    items="center"
                  >
                    <MaterialIcons name="info-outline" size={14} color={Colors.secondaryText} />
                    <Text fontSize={12} color={Colors.secondaryText} flex={1}>
                      {"You're on a walking leg — continue on to your current train or bus leg to reroute along it."}
                    </Text>
                  </XStack>
                )}
              </>
            )
          })()}
        </YStack>

        {/* Scrollable issues list */}
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1, backgroundColor: Colors.background }}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.sm,
            paddingBottom: insets.bottom + Spacing.xl,
          }}
        >
          <RouteAlerts
            assessments={upcomingBlockedAssessments}
            disruptions={[]}
            hideHeader
            defaultExpanded
          />
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Alternatives sheet — modal-style popup, no handlebar, opens over the issues sheet. */}
      <BottomSheet
        ref={alternativesSheetRef}
        index={-1}
        snapPoints={alternativesSnapPoints}
        backdropComponent={rerouteBackdrop}
        handleComponent={null}
        enablePanDownToClose
        onChange={(index) => {
          if (index === -1 && onClosed('reroute-alternatives')) {
            setRerouteState({ phase: 'idle' })
            setPreviewJourney(null)
          }
        }}
      >
        <View onLayout={(e) => setRerouteHeaderH(e.nativeEvent.layout.height)}>
          <SheetHeader
            title="Alternative routes"
            onClose={() => alternativesSheetRef.current?.close()}
            modal
          />
        </View>
        <BottomSheetScrollView
          showsVerticalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: Spacing.lg,
            paddingTop: Spacing.xs,
            paddingBottom: Spacing.xl,
          }}
        >
          <YStack gap="$4">
            {rerouteState.phase === 'found' && (
              <YStack gap="$2" onLayout={(e) => setRerouteResultsH(e.nativeEvent.layout.height)}>
                {rerouteState.alternatives.map(({ journey, tags }, i) => (
                  <JourneyResultCard
                    key={i}
                    journey={journey}
                    tags={tags}
                    onPress={() =>
                      setPreviewJourney({
                        journey,
                        tags,
                        from: params?.from,
                        to: params?.to,
                        outages: params?.outages,
                        level: params?.level,
                      })
                    }
                  />
                ))}
              </YStack>
            )}

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

      {/* Route preview — opens when a result card is tapped; no save option */}
      <JourneyDetailSheet
        params={previewJourney}
        onClose={() => setPreviewJourney(null)}
        onStartJourney={handlePreviewStart}
        hideSave
      />
    </>
  )
}
