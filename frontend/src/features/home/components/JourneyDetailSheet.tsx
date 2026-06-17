// Journey detail as a bottom sheet — TfL-Go-style overview with left gutter timeline.
// Single snap at full height minus top buttons. Dark backdrop, swipe/tap to close.

import { MaterialIcons } from '@expo/vector-icons'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
  RouteTags,
  stripStationSuffix,
} from '@/features/journey/components/legDisplay'
import { useMobilityStyle, stablePickIndex } from '@/lib/MobilityStyleContext'
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

export type ActiveJourneyParams = {
  savedId?: string
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

// Renders a dashed vertical line for walking legs. Uses absoluteFillObject so
// the segments don't affect row height — overflow:'hidden' clips the excess.
// borderStyle:'dashed' on a single border side is unreliable on iOS.
function DashedVerticalLine({ color }: { color: string }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: 2,
        bottom: 2,
        left: 0,
        right: 0,
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: 40 }).map((_, i) => (
        <View
          key={i}
          style={{ width: 2, height: 5, borderRadius: 1, backgroundColor: color, marginBottom: 3 }}
        />
      ))}
    </View>
  )
}

type WaypointKind = 'origin' | 'transit' | 'destination'
type WaypointType = 'tube' | 'bus' | 'default'

function TflRoundel() {
  return (
    <Svg width={28} height={23} viewBox="0 0 615.3 500">
      <Circle cx={308.15} cy={250} r={161.3} fill="white" />
      <Path
        d="m469.5 250c0 89.1-72.3 161.3-161.3 161.3-89.1 0-161.3-72.2-161.3-161.3s72.1-161.3 161.2-161.3 161.4 72.2 161.4 161.3m-161.4-250c-138.1 0-250 111.9-250 250s111.9 250 250 250 250-111.9 250-250-111.9-250-250-250"
        fill="#e1251f"
        fillRule="nonzero"
      />
      <Rect y={199.5} width={615.3} height={101.1} fill="#000f9f" />
    </Svg>
  )
}

function TimelineWaypoint({
  kind,
  name,
  time,
  dotColor,
  stopNumber,
  waypointType = 'default',
}: {
  kind: WaypointKind
  name: string
  time?: string
  dotColor: string
  stopNumber?: string
  waypointType?: WaypointType
}) {
  const { Colors } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 40 }}>
      <View style={{ width: GUTTER_W, alignItems: 'center', justifyContent: 'center' }}>
        {kind === 'destination' ? (
          <MaterialIcons name="place" size={22} color={Colors.text} />
        ) : kind === 'origin' && waypointType === 'default' ? (
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
        ) : waypointType === 'tube' ? (
          <TflRoundel />
        ) : waypointType === 'bus' ? (
          <MaterialIcons name="directions-bus" size={20} color={dotColor} />
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
        <Text fontSize={17} fontWeight="600" color={Colors.text}>
          {name}
          {stopNumber ? ` (Stop ${stopNumber})` : ''}
        </Text>
      </View>
      {time ? (
        <Text fontSize={15} fontWeight="500" color={Colors.secondaryText}>
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
  stopPoints,
  legDuration,
  departureTime,
  arrivalTime,
}: {
  mode: string
  lineColor: string
  routeName?: string | null
  direction?: string | null
  walkDuration?: number
  stopCount: number
  stopPoints: { name?: string }[]
  legDuration: number
  departureTime?: string | null
  arrivalTime?: string | null
}) {
  const { Colors } = useTheme()
  const mobilityStyle = useMobilityStyle()
  const connectorSeed = `${mode}${walkDuration ?? legDuration}${departureTime ?? ''}${arrivalTime ?? ''}`
  const funPair = mobilityStyle.funPairs?.[stablePickIndex(mobilityStyle.funPairs, connectorSeed)]
  const walkLabel = funPair?.label ?? mobilityStyle.label
  const walkIcon = funPair?.icon ?? mobilityStyle.icon
  const isWalking = mode === 'walking'
  const isBus = mode === 'bus' || mode === 'coach'
  const badgeBg = isBus ? Colors.searchBg : lineColor
  const badgeText = isBus ? Colors.text : 'white'
  const canExpand = stopCount > 0 && stopPoints.length > 0
  const [expanded, setExpanded] = useState(false)
  const stopLabel =
    stopCount > 0
      ? `${stopCount} ${stopCount === 1 ? 'stop' : 'stops'} · ${legDuration} min`
      : `${legDuration} min`

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', minHeight: 44 }}>
      {/* Gutter line */}
      <View style={{ width: GUTTER_W, alignItems: 'center' }}>
        {isWalking ? (
          <DashedVerticalLine color={Colors.tertiaryText} />
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
      <View style={{ flex: 1, paddingLeft: 6, paddingVertical: 10, gap: 6 }}>
        {isWalking ? (
          <XStack items="center" gap={6}>
            <MaterialIcons name={walkIcon} size={17} color={Colors.text} />
            <Text fontSize={15} color={Colors.text}>
              <Text fontWeight="700">{walkLabel}</Text>
              {'  '}
              <Text color={Colors.secondaryText}>{walkDuration} min</Text>
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
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderWidth: isBus ? Borders.thin : 0,
                    borderColor: isBus ? Colors.border : undefined,
                  }}
                >
                  <Text fontSize={13} fontWeight="700" color={badgeText}>
                    {routeName}
                  </Text>
                </View>
              ) : null}
              {direction ? (
                <Text fontSize={15} color={Colors.secondaryText}>
                  towards {stripStationSuffix(direction)}
                </Text>
              ) : null}
            </XStack>

            {/* Stops + duration — icon is its own button, text is separate */}
            <XStack items="center" gap={8}>
              {stopCount > 0 ? (
                <TouchableOpacity
                  onPress={() => setExpanded((v) => !v)}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={
                    expanded ? 'Hide intermediate stops' : 'Show intermediate stops'
                  }
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialIcons
                    name={expanded ? 'remove-circle-outline' : 'add-circle-outline'}
                    size={24}
                    color={Colors.blue}
                  />
                </TouchableOpacity>
              ) : null}
              <Text
                fontSize={15}
                fontWeight={canExpand ? '600' : undefined}
                color={canExpand ? Colors.blue : Colors.secondaryText}
              >
                {stopLabel}
              </Text>
            </XStack>

            {expanded ? (
              <View style={{ marginTop: 4, gap: 0 }}>
                {stopPoints.map((sp, idx) => (
                  <XStack key={idx} items="center" gap={8} style={{ paddingVertical: 6 }}>
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        borderWidth: 2,
                        borderColor: lineColor,
                        backgroundColor: Colors.card,
                      }}
                    />
                    <Text fontSize={15} color={Colors.text}>
                      {sp.name ? stripStationSuffix(sp.name) : '—'}
                    </Text>
                  </XStack>
                ))}
              </View>
            ) : null}
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
  hideSave?: boolean
}

export function JourneyDetailSheet({
  params,
  onClose,
  onStartJourney,
  onSaveChanged,
  onHeightChange,
  hideSave = false,
}: Props) {
  const { Colors, Radii } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xl,
          paddingBottom: Spacing.lg,
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
          paddingTop: Spacing.sm,
          paddingBottom: Spacing.section,
        },
        actionRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: Colors.separator,
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
      }),
    [Colors, Radii],
  )

  const insets = useSafeAreaInsets()
  // Measured height of the header + action buttons — becomes the minimum snap so the sheet can
  // never be dragged below the Start/Save row (but no backdrop blocks the map above it).
  const [fixedH, setFixedH] = useState(180)
  const snapPoints = useMemo(
    () => [fixedH + insets.bottom, SCREEN_H - insets.top - 66],
    [fixedH, insets.bottom, insets.top],
  )
  const sheetRef = useRef<BottomSheetRef>(null)

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null)
  const [startBusy, setStartBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [liveOutages, setLiveOutages] = useState<StationOutage[] | null>(null)

  const { stations } = useStations()

  const { user } = useAuth()

  // Re-fetch live outages each time a journey is opened so the alerts reflect the current state
  // rather than the stale snapshot stored with the saved journey.
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
    // params.journey is the only dep we want
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.journey])

  useEffect(() => {
    if (!params) {
      sheetRef.current?.close()
      return
    }
    sheetRef.current?.snapToIndex(0)
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
    const activeOutages = liveOutages ?? params.outages ?? []
    try {
      let savedJourneyId = currentSavedId
      if (!savedJourneyId) {
        const record = await saveJourney({
          from: params.from,
          to: params.to,
          level: params.level ?? null,
          outages: activeOutages,
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
        outages: activeOutages,
        level: params.level ?? null,
      })
      onStartJourney({
        savedId: savedJourneyId,
        journey: params.journey,
        from: params.from,
        to: params.to,
        outages: activeOutages,
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
        enablePanDownToClose={false}
        onChange={handleChange}
      >
        {null}
      </BottomSheet>
    )
  }

  const { from, to } = params
  const { journey, tags } = params
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

  const isBusLeg = (leg: Leg) => leg.mode.name === 'bus' || leg.mode.name === 'coach'
  const firstLeg = journey.legs[0]
  const originStopNumber =
    firstLeg && isBusLeg(firstLeg) ? firstLeg.departurePoint?.stopLetter : undefined

  // Origin waypoint
  const originWaypointType: WaypointType = isBusLeg(firstLeg)
    ? 'bus'
    : firstLeg && firstLeg.mode.name !== 'walking'
      ? 'tube'
      : 'default'
  timelineItems.push(
    <TimelineWaypoint
      key="origin"
      kind="origin"
      name={originName}
      time={clockTime(journey.startDateTime)}
      dotColor={Colors.text}
      stopNumber={originStopNumber}
      waypointType={originWaypointType}
    />,
  )

  journey.legs.forEach((leg: Leg, i: number) => {
    const isWalking = leg.mode.name === 'walking'
    const connectorColor = isWalking ? Colors.separator : legLineColor(leg, Colors.blue)
    const routeName = leg.routeOptions?.[0]?.name ?? null
    const direction = leg.routeOptions?.[0]?.directions?.find(Boolean) ?? null
    const allStopPoints = leg.path?.stopPoints ?? []
    // Drop the arrival station from the list (already shown as the arrival node) but keep it in the count
    const stopPoints = allStopPoints.length > 0 ? allStopPoints.slice(0, -1) : allStopPoints
    const stopCount = allStopPoints.length
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
        stopPoints={isWalking ? [] : stopPoints}
        legDuration={isWalking ? 0 : leg.duration}
        departureTime={leg.departureTime}
        arrivalTime={leg.arrivalTime}
      />,
    )

    // Arrival waypoint — show stop number when this leg or the next is a bus leg
    const dotColor = nextIsTransit ? legLineColor(nextLeg, Colors.blue) : Colors.text
    const arrivalName = isLast
      ? (to?.label ?? stripStationSuffix(leg.arrivalPoint?.commonName ?? 'Destination'))
      : stripStationSuffix(leg.arrivalPoint?.commonName ?? '')
    const arrivalStopNumber = isBusLeg(leg)
      ? leg.arrivalPoint?.stopLetter
      : nextLeg && isBusLeg(nextLeg)
        ? nextLeg.departurePoint?.stopLetter
        : undefined
    const arrivalWaypointType: WaypointType =
      isLast || !nextLeg || nextLeg.mode.name === 'walking'
        ? 'default'
        : isBusLeg(nextLeg)
          ? 'bus'
          : 'tube'

    timelineItems.push(
      <TimelineWaypoint
        key={`wp-${i}`}
        kind={isLast ? 'destination' : 'transit'}
        name={arrivalName}
        time={leg.arrivalTime ? clockTime(leg.arrivalTime) : undefined}
        dotColor={dotColor}
        stopNumber={arrivalStopNumber}
        waypointType={arrivalWaypointType}
      />,
    )
  })

  // Waiting time row
  if (waiting >= 1) {
    timelineItems.push(
      <XStack key="waiting" gap="$3" items="center" mt="$1" ml={GUTTER_W}>
        <MaterialIcons name="schedule" size={16} color={Colors.secondaryText} />
        <Text fontSize={15} color={Colors.secondaryText}>
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
      enablePanDownToClose={false}
      onChange={handleChange}
    >
      {/* Measuring wrapper: drives the minimum snap to the bottom of the action buttons */}
      <View onLayout={(e) => setFixedH(e.nativeEvent.layout.height)}>
      {/* Header: prominent duration + arrive/fare + tags + close */}
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name={modeIcon(primaryMode)} size={20} color={Colors.secondaryText} />
            <Text fontSize={26} fontWeight="800" color={Colors.text} style={{ lineHeight: 30 }}>
              {journey.duration} min
            </Text>
            <View style={{ flex: 1 }} />
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
          <Text fontSize={16} color={Colors.secondaryText}>
            Arrive {clockTime(journey.arrivalDateTime)}
            {fare ? ` · ${fare}` : ''}
          </Text>
          {tags && tags.length > 0 ? (
            <View style={{ marginTop: 2 }}>
              <RouteTags tags={tags} />
            </View>
          ) : null}
        </View>
      </View>

      {/* Start + Save action buttons — pinned above the scroll view */}
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
          <Text fontSize={16} fontWeight="700" color="white">
            {startBusy ? 'Starting…' : 'Start'}
          </Text>
        </TouchableOpacity>

        {!hideSave && (
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
            <Text fontSize={16} fontWeight="600" color={Colors.text}>
              {saveBusy ? 'Saving…' : saved ? 'Saved' : 'Save'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      </View>{/* end measuring wrapper */}

      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Combined disruptions: TfL service disruptions + accessibility outages, tiered */}
        <RouteAlerts assessments={outageAssessments} disruptions={disruptions} />

        {/* Gutter timeline */}
        <View style={{ gap: 0, marginTop: Spacing.lg }}>{timelineItems}</View>
      </BottomSheetScrollView>
    </BottomSheet>
  )
}
