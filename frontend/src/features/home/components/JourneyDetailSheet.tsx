// Journey detail as a bottom sheet — TfL-Go-style overview with left gutter timeline.
// Single snap at full height minus top buttons. Dark backdrop, swipe/tap to close.

import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BottomSheetBackdrop, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { useStations } from '@/features/stations'
import { useAuth } from '@/features/auth'
import { assessOutages, collectDisruptions } from '@/features/journey/api/outageRelevance'
import { fetchStationOutages, matchOutages } from '@/features/journey/api/accessibility'
import { startActiveJourney } from '@/features/journey/api/activeJourney'
import {
  deleteJourney,
  journeyKey,
  loadSavedJourneys,
  saveJourney,
} from '@/features/journey/api/savedJourneys'
import {
  clockTime,
  fareLabel,
  legLineColor,
  modeIcon,
  ModePipe,
  RouteTags,
  stripStationSuffix,
  WALKING_ICON,
  WALKING_LABEL,
} from '@/features/journey/components/legDisplay'
import { RouteAlerts } from '@/features/journey/components/RouteAlerts'
import { useTheme, Borders, Heights, Opacity, Spacing } from '@/theme'
import type { AccessibilityPreference, Journey, Leg, RouteTag } from '@/features/journey/api/tfl'
import type { ResolvedLocation } from '@/features/journey/api/geocode'
import type { StationOutage } from '@/features/journey/api/accessibility'

// The expanded view of a single journey. `savedId` is set when opened from the saved list, so
// the sheet can show Remove instead of Save. The journey and its context are plain JSON.
export type JourneyDetailParams = {
  journey: Journey
  from?: ResolvedLocation
  to?: ResolvedLocation
  outages?: StationOutage[]
  level?: AccessibilityPreference | null
  savedId?: string
  tags?: RouteTag[]
}

// The follow/execute payload for an in-progress journey. Mirrors JourneyDetailParams plus the
// savedId every active journey is anchored to (the detail sheet saves before starting).
export type ActiveJourneyParams = {
  savedId: string
  journey: Journey
  from?: ResolvedLocation
  to?: ResolvedLocation
  outages?: StationOutage[]
  level?: AccessibilityPreference | null
}

const SCREEN_H = Dimensions.get('window').height
// Width of the left gutter column containing the vertical timeline line and waypoint dots.
const GUTTER_W = 36

// ---------------------------------------------------------------------------
// Timeline sub-components
// ---------------------------------------------------------------------------

type WaypointKind = 'origin' | 'transit' | 'destination'

function TimelineWaypoint({
  kind,
  name,
  time,
  dotColor,
}: {
  kind: WaypointKind
  name: string
  time?: string
  dotColor: string
}) {
  const { Colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32 }}>
      <View style={{ width: GUTTER_W, alignItems: 'center', justifyContent: 'center' }}>
        {kind === 'destination' ? (
          <MaterialIcons name="place" size={22} color={Colors.text} />
        ) : kind === 'origin' ? (
          <View
            style={{
              width: 13,
              height: 13,
              borderRadius: 7,
              borderWidth: 2,
              borderColor: Colors.text,
              backgroundColor: Colors.card,
            }}
          />
        ) : (
          <View
            style={{
              width: 13,
              height: 13,
              borderRadius: 7,
              backgroundColor: dotColor,
            }}
          />
        )}
      </View>
      <View style={{ flex: 1, paddingLeft: 6 }}>
        <Text fontSize={15} fontWeight="600" color={Colors.text}>
          {name}
        </Text>
      </View>
      {time ? (
        <Text fontSize={13} fontWeight="500" color={Colors.secondaryText}>
          {time}
        </Text>
      ) : null}
    </View>
  )
}

function TimelineConnector({
  mode,
  lineColor,
  routeName,
  direction,
  walkDuration,
  stopCount,
  legDuration,
}: {
  mode: string
  lineColor: string
  routeName?: string | null
  direction?: string | null
  walkDuration?: number
  stopCount: number
  legDuration: number
}) {
  const { Colors } = useTheme()
  const isWalking = mode === 'walking'
  const isBus = mode === 'bus' || mode === 'coach'
  const badgeBg = isBus ? Colors.searchBg : lineColor
  const badgeText = isBus ? Colors.text : 'white'
  const stopLabel =
    stopCount > 0
      ? `${stopCount} ${stopCount === 1 ? 'stop' : 'stops'} · ${legDuration} min`
      : `${legDuration} min`

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: 44 }}>
      {/* Gutter line */}
      <View style={{ width: GUTTER_W, alignItems: 'center' }}>
        {isWalking ? (
          <View
            style={{
              flex: 1,
              width: 0,
              borderLeftWidth: 2,
              borderLeftColor: Colors.separator,
              borderStyle: 'dashed',
              marginVertical: 2,
            }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              width: 3,
              backgroundColor: lineColor,
              borderRadius: 2,
              marginVertical: 2,
            }}
          />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, paddingLeft: 6, paddingVertical: 8, gap: 4 }}>
        {isWalking ? (
          <XStack items="center" gap={5}>
            <MaterialIcons name={WALKING_ICON} size={14} color={Colors.secondaryText} />
            <Text fontSize={13} color={Colors.secondaryText}>
              {WALKING_LABEL} {walkDuration} min
            </Text>
          </XStack>
        ) : (
          <>
            {/* Line badge + direction */}
            <XStack items="center" gap={6} flexWrap="wrap">
              {routeName ? (
                <View
                  style={{
                    backgroundColor: badgeBg,
                    borderRadius: 4,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    borderWidth: isBus ? Borders.thin : 0,
                    borderColor: isBus ? Colors.border : undefined,
                  }}
                >
                  <Text fontSize={11} fontWeight="700" color={badgeText}>
                    {routeName}
                  </Text>
                </View>
              ) : null}
              {direction ? (
                <Text fontSize={13} color={Colors.secondaryText}>
                  towards {stripStationSuffix(direction)}
                </Text>
              ) : null}
            </XStack>

            {/* Stops + duration */}
            <XStack items="center" gap={4}>
              {stopCount > 0 ? (
                <MaterialIcons name="add-circle-outline" size={13} color={Colors.secondaryText} />
              ) : null}
              <Text fontSize={12} color={Colors.secondaryText}>
                {stopLabel}
              </Text>
            </XStack>
          </>
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main sheet
// ---------------------------------------------------------------------------

type Props = {
  params: JourneyDetailParams | null
  onClose: () => void
  onStartJourney: (params: ActiveJourneyParams) => void
  onSaveChanged?: () => void
  onHeightChange?: (height: number) => void
}

export function JourneyDetailSheet({
  params,
  onClose,
  onStartJourney,
  onSaveChanged,
  onHeightChange,
}: Props) {
  const { Colors, Radii } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.lg,
          paddingBottom: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: Colors.separator,
        },
        closeBtn: {
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        content: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.lg,
          paddingBottom: Spacing.section,
        },
        actionRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
          marginTop: Spacing.lg,
        },
        actionBtn: {
          flex: 1,
          height: Heights.button,
          borderRadius: Radii.button,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderWidth: Borders.medium,
        },
        separator: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: Colors.separator,
          marginVertical: Spacing.lg,
        },
      }),
    [Colors, Radii],
  )

  const darkBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        opacity={0.55}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        pressBehavior="close"
      />
    ),
    [],
  )

  const insets = useSafeAreaInsets()
  const snapPoints = useMemo(() => [SCREEN_H - insets.top - 66], [insets.top])
  const sheetRef = useRef<BottomSheetRef>(null)

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null)
  const [startBusy, setStartBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [liveOutages, setLiveOutages] = useState<StationOutage[] | null>(null)

  const { stations } = useStations()

  const { user } = useAuth()

  // Re-fetch live outages each time a journey is opened so the alerts reflect the current state
  // rather than the stale snapshot stored with the saved journey.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!params) return
    let active = true
    setLiveOutages(null)
    fetchStationOutages().then((all) => {
      if (active) setLiveOutages(matchOutages(params.journey, all))
    })
    return () => {
      active = false
    }
  }, [params?.journey])

  useEffect(() => {
    if (!params) {
      sheetRef.current?.close()
      return
    }
    sheetRef.current?.snapToIndex(0)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartBusy(false)
    setSaveBusy(false)

    const { savedId, journey, from, to } = params
    if (savedId) {
      setCurrentSavedId(savedId)
      return
    }
    let active = true
    ;(async () => {
      const saved = await loadSavedJourneys()
      if (!active) return
      const key = journeyKey(journey, from, to)
      const match = saved.find((s) => journeyKey(s.journey, s.from, s.to) === key)
      if (match) setCurrentSavedId(match.id)
      else setCurrentSavedId(null)
    })()
    return () => {
      active = false
    }
  }, [params])

  function handleChange(index: number) {
    onHeightChange?.(index >= 0 ? snapPoints[index] : 0)
    if (index === -1) onClose()
  }

  const outageAssessments = useMemo(
    () =>
      params ? assessOutages(params.journey, liveOutages ?? params.outages ?? [], stations) : [],
    [params, liveOutages, stations],
  )

  const disruptions = useMemo(() => (params ? collectDisruptions(params.journey) : []), [params])

  async function toggleSave() {
    if (!params || saveBusy || startBusy) return
    setSaveBusy(true)
    try {
      if (currentSavedId) {
        await deleteJourney(currentSavedId)
        setCurrentSavedId(null)
      } else {
        const record = await saveJourney({
          from: params.from,
          to: params.to,
          level: params.level ?? null,
          outages: params.outages ?? [],
          journey: params.journey,
        })
        setCurrentSavedId(record.id)
      }
      onSaveChanged?.()
    } catch {
      Alert.alert('Error', 'Could not update your saved journeys. Please try again.')
    } finally {
      setSaveBusy(false)
    }
  }

  async function startJourney() {
    if (!params || startBusy || saveBusy) return
    setStartBusy(true)
    try {
      let savedJourneyId = currentSavedId
      if (!savedJourneyId) {
        const record = await saveJourney({
          from: params.from,
          to: params.to,
          level: params.level ?? null,
          outages: params.outages ?? [],
          journey: params.journey,
        })
        savedJourneyId = record.id
        setCurrentSavedId(record.id)
      }
      await startActiveJourney({
        savedId: savedJourneyId,
        journey: params.journey,
        from: params.from,
        to: params.to,
        outages: params.outages ?? [],
        level: params.level ?? null,
      })
      onStartJourney({
        savedId: savedJourneyId,
        journey: params.journey,
        from: params.from,
        to: params.to,
        outages: params.outages ?? [],
        level: params.level ?? null,
      })
    } catch {
      Alert.alert('Error', 'Could not start this journey. Please try again.')
      setStartBusy(false)
    }
  }

  // Empty-params shell — kept mounted for animation continuity.
  if (!params) {
    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        handleComponent={null}
        backdropComponent={darkBackdrop}
        onChange={handleChange}
      >
        {null}
      </BottomSheet>
    )
  }

  const { journey, from, to, tags } = params
  const fare = fareLabel(journey, user?.traveller_type, user?.railcard)
  const saved = currentSavedId !== null
  const anyBusy = startBusy || saveBusy
  const primaryMode = journey.legs.find((l) => l.mode.name !== 'walking')?.mode.name ?? 'walking'
  const legTotal = journey.legs.reduce((sum, leg) => sum + leg.duration, 0)
  const waiting = journey.duration - legTotal

  // ── Build gutter timeline ──────────────────────────────────────────────
  const originName =
    from?.label ?? stripStationSuffix(journey.legs[0]?.departurePoint?.commonName ?? 'Start')

  const timelineItems: React.ReactNode[] = []

  // Origin waypoint
  timelineItems.push(
    <TimelineWaypoint
      key="origin"
      kind="origin"
      name={originName}
      time={clockTime(journey.startDateTime)}
      dotColor={Colors.text}
    />,
  )

  journey.legs.forEach((leg: Leg, i: number) => {
    const isWalking = leg.mode.name === 'walking'
    const connectorColor = isWalking ? Colors.separator : legLineColor(leg, Colors.blue)
    const routeName = leg.routeOptions?.[0]?.name ?? null
    const direction = leg.routeOptions?.[0]?.directions?.find(Boolean) ?? null
    const stopCount = leg.path?.stopPoints?.length ?? 0
    const isLast = i === journey.legs.length - 1
    const nextLeg = journey.legs[i + 1]
    const nextIsTransit = nextLeg && nextLeg.mode.name !== 'walking'

    // Connector
    timelineItems.push(
      <TimelineConnector
        key={`conn-${i}`}
        mode={leg.mode.name}
        lineColor={connectorColor}
        routeName={routeName}
        direction={direction}
        walkDuration={isWalking ? leg.duration : undefined}
        stopCount={isWalking ? 0 : stopCount}
        legDuration={isWalking ? 0 : leg.duration}
      />,
    )

    // Arrival waypoint
    const dotColor = nextIsTransit ? legLineColor(nextLeg, Colors.blue) : Colors.text
    const arrivalName = isLast
      ? (to?.label ?? stripStationSuffix(leg.arrivalPoint?.commonName ?? 'Destination'))
      : stripStationSuffix(leg.arrivalPoint?.commonName ?? '')

    timelineItems.push(
      <TimelineWaypoint
        key={`wp-${i}`}
        kind={isLast ? 'destination' : 'transit'}
        name={arrivalName}
        time={leg.arrivalTime ? clockTime(leg.arrivalTime) : undefined}
        dotColor={dotColor}
      />,
    )
  })

  // Waiting time row
  if (waiting >= 1) {
    timelineItems.push(
      <XStack key="waiting" gap="$3" items="center" mt="$1" ml={GUTTER_W}>
        <MaterialIcons name="schedule" size={14} color={Colors.secondaryText} />
        <Text fontSize={13} color={Colors.secondaryText}>
          Waiting & connections · {waiting} min
        </Text>
      </XStack>,
    )
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      handleComponent={null}
      backdropComponent={darkBackdrop}
      onChange={handleChange}
    >
      {/* Header: prominent duration + arrive/fare + close */}
      <View style={styles.header}>
        <MaterialIcons name={modeIcon(primaryMode)} size={24} color={Colors.secondaryText} />
        <View style={{ flex: 1 }}>
          <Text fontSize={26} fontWeight="800" color={Colors.text} style={{ lineHeight: 30 }}>
            {journey.duration} min
          </Text>
          <Text fontSize={14} color={Colors.secondaryText}>
            Arrive {clockTime(journey.arrivalDateTime)}
            {fare ? ` · ${fare}` : ''}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => sheetRef.current?.close()}
          style={styles.closeBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <MaterialIcons name="close" size={18} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Route mode chips — larger size for readability in the detail view */}
        <ModePipe legs={journey.legs} compact={false} />

        {/* Route tags (Fastest, Fewest changes, etc.) */}
        {tags && tags.length > 0 ? (
          <View style={{ marginTop: Spacing.sm }}>
            <RouteTags tags={tags} />
          </View>
        ) : null}

        {/* Start + Save action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              {
                backgroundColor: Colors.blue,
                borderColor: Colors.blue,
              },
              anyBusy && { opacity: Opacity.disabledMid },
            ]}
            onPress={anyBusy ? undefined : startJourney}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Start journey"
          >
            <MaterialIcons name="navigation" size={18} color="white" />
            <Text fontSize={15} fontWeight="700" color="white">
              {startBusy ? 'Starting…' : 'Start'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.actionBtn,
              {
                backgroundColor: saved ? Colors.searchBg : Colors.card,
                borderColor: Colors.border,
              },
              anyBusy && { opacity: Opacity.disabledMid },
            ]}
            onPress={anyBusy ? undefined : toggleSave}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved journeys' : 'Save this journey'}
          >
            <MaterialIcons
              name={saved ? 'bookmark' : 'bookmark-border'}
              size={18}
              color={Colors.text}
            />
            <Text fontSize={15} fontWeight="600" color={Colors.text}>
              {saveBusy ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Combined disruptions: TfL service disruptions + accessibility outages, tiered */}
        <RouteAlerts assessments={outageAssessments} disruptions={disruptions} />

        {/* Timeline divider */}
        <View style={styles.separator} />

        {/* Gutter timeline */}
        <View style={{ gap: 0 }}>{timelineItems}</View>
      </BottomSheetScrollView>
    </BottomSheet>
  )
}
