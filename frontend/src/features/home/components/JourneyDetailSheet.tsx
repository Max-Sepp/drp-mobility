// Journey detail as a bottom sheet — replaces JourneyDetailScreen.
// Single snap at 92%. Scrollable content, fixed "Start journey" bar pinned at the bottom.

import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { useStations } from '@/features/stations'
import { useAuth } from '@/features/auth'
import { resolveStationName } from '@/features/journey/api/accessibility'
import { assessOutages } from '@/features/journey/api/outageRelevance'
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
  humanizeSummary,
  LegStations,
  lineLabel,
  modeIcon,
  modeLabel,
  RouteTags,
} from '@/features/journey/components/legDisplay'
import { OutageDetail } from '@/features/journey/components/OutageDetail'
import type { RootStackParamList } from '@/navigation/types'
import { useTheme, Borders, Heights, Opacity, Spacing } from '@/theme'

export type JourneyDetailParams = RootStackParamList['JourneyDetail']
export type ActiveJourneyParams = RootStackParamList['ActiveJourney']

const SCREEN_H = Dimensions.get('window').height
const SNAP_POINTS = [SCREEN_H * 0.92]

type Props = {
  params: JourneyDetailParams | null
  onClose: () => void
  onStartJourney: (params: ActiveJourneyParams) => void
}

export function JourneyDetailSheet({ params, onClose, onStartJourney }: Props) {
  const { Colors, Radii } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
          gap: Spacing.sm,
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
          paddingBottom: Spacing.lg,
        },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Colors.separator,
          backgroundColor: Colors.card,
        },
        startBtn: {
          height: Heights.button,
          borderRadius: Radii.button,
          backgroundColor: Colors.blue,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [Colors, Radii],
  )
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetRef>(null)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const resolveStation = useCallback(
    (name: string) => resolveStationName(name, stationNames),
    [stationNames],
  )

  const { user } = useAuth()

  useEffect(() => {
    if (!params) {
      sheetRef.current?.close()
      return
    }
    sheetRef.current?.snapToIndex(0)
    setBusy(false)

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
    if (index === -1) onClose()
  }

  const outageAssessments = useMemo(
    () => (params ? assessOutages(params.journey, params.outages ?? [], stations) : []),
    [params, stations],
  )

  async function toggleSave() {
    if (!params || busy) return
    setBusy(true)
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
    } catch {
      Alert.alert('Error', 'Could not update your saved journeys. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function startJourney() {
    if (!params || busy) return
    setBusy(true)
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
      setBusy(false)
    }
  }

  if (!params) {
    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        onChange={handleChange}
      >
        {null}
      </BottomSheet>
    )
  }

  const { journey, from, to, tags } = params
  const fare = fareLabel(journey, user?.traveller_type, user?.railcard)
  const legTotal = journey.legs.reduce((sum, leg) => sum + leg.duration, 0)
  const waiting = journey.duration - legTotal
  const saved = currentSavedId !== null

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onChange={handleChange}
    >
      {/* Header */}
      <View style={styles.header}>
        <Text fontSize={18} fontWeight="700" color={Colors.text} style={{ flex: 1 }}>
          Journey details
        </Text>
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
        <YStack gap="$4">
          {/* Summary card */}
          <YStack
            p="$4"
            gap="$3"
            style={{
              borderWidth: Borders.medium,
              borderColor: Colors.border,
              borderRadius: Radii.button,
              backgroundColor: Colors.searchBg,
            }}
          >
            <RouteTags tags={tags} />

            {(from || to) && (
              <YStack gap="$1">
                {from && (
                  <XStack gap="$2" items="center">
                    <MaterialIcons
                      name="trip-origin"
                      size={14}
                      color={Colors.secondaryText}
                      style={{ width: 18 }}
                    />
                    <Text fontSize={14} color={Colors.text} flex={1}>
                      {from.label}
                    </Text>
                  </XStack>
                )}
                {to && (
                  <XStack gap="$2" items="center">
                    <MaterialIcons
                      name="place"
                      size={16}
                      color={Colors.secondaryText}
                      style={{ width: 18 }}
                    />
                    <Text fontSize={14} color={Colors.text} flex={1}>
                      {to.label}
                    </Text>
                  </XStack>
                )}
              </YStack>
            )}

            <XStack items="center" justify="space-between">
              <XStack items="baseline" gap="$2">
                <Text fontSize={22} fontWeight="700" color={Colors.text}>
                  {journey.duration} min
                </Text>
                {fare && (
                  <Text fontSize={16} fontWeight="600" color={Colors.success}>
                    {fare}
                  </Text>
                )}
              </XStack>
              <Text fontSize={16} color={Colors.text}>
                {clockTime(journey.startDateTime)} → {clockTime(journey.arrivalDateTime)}
              </Text>
            </XStack>

            <XStack
              items="center"
              justify="center"
              gap="$2"
              pressStyle={{ opacity: Opacity.pressedLight }}
              onPress={toggleSave}
              opacity={busy ? Opacity.disabledMid : 1}
              role="button"
              aria-label={saved ? 'Remove from saved journeys' : 'Save this journey'}
              style={{
                height: Heights.touchTarget,
                borderRadius: Radii.button,
                borderWidth: Borders.medium,
                borderColor: saved ? Colors.border : Colors.text,
                backgroundColor: saved ? Colors.searchBg : Colors.text,
              }}
            >
              <MaterialIcons
                name={saved ? 'bookmark' : 'bookmark-border'}
                size={20}
                color={saved ? Colors.text : Colors.card}
              />
              <Text fontSize={15} fontWeight="700" color={saved ? Colors.text : Colors.card}>
                {saved ? 'Saved — tap to remove' : 'Save journey'}
              </Text>
            </XStack>
          </YStack>

          <OutageDetail assessments={outageAssessments} />

          {/* Per-leg breakdown */}
          <YStack gap="$3.5">
            {journey.legs.map((leg, i) => {
              const line = lineLabel(leg)
              const stopCount = leg.path?.stopPoints?.length ?? 0
              const legTimes =
                leg.departureTime && leg.arrivalTime
                  ? `${clockTime(leg.departureTime)} → ${clockTime(leg.arrivalTime)}`
                  : null
              return (
                <XStack key={i} gap="$3" items="flex-start">
                  <MaterialIcons
                    name={modeIcon(leg.mode.name)}
                    size={24}
                    color={Colors.blue}
                    aria-label={modeLabel(leg.mode.name)}
                    style={{ width: 26, marginTop: 1 }}
                  />
                  <YStack flex={1} gap="$1">
                    <Text fontSize={15} fontWeight="600" color={Colors.text}>
                      {humanizeSummary(leg.instruction.summary, [from, to])}
                    </Text>
                    {line && (
                      <Text fontSize={13} color={Colors.blue} fontWeight="600">
                        {line}
                      </Text>
                    )}
                    <LegStations
                      leg={leg}
                      resolveStation={resolveStation}
                      onStationPress={(s) => navigation.navigate('Station', { station: s })}
                    />
                    {!line &&
                      leg.instruction.detailed &&
                      leg.instruction.detailed !== leg.instruction.summary && (
                        <Text fontSize={13} color={Colors.text}>
                          {humanizeSummary(leg.instruction.detailed, [from, to])}
                        </Text>
                      )}
                    {stopCount > 0 && (
                      <Text fontSize={13} color={Colors.secondaryText}>
                        {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                      </Text>
                    )}
                    {leg.isDisrupted && leg.disruptions?.some((d) => d.description) && (
                      <YStack
                        gap="$1"
                        p="$2"
                        style={{
                          backgroundColor: Colors.dangerBg,
                          borderWidth: Borders.thin,
                          borderColor: Colors.dangerBorder,
                          borderRadius: Radii.small,
                        }}
                      >
                        {leg.disruptions
                          .filter((d) => d.description)
                          .map((d, j) => (
                            <Text key={j} fontSize={12} color={Colors.dangerDark}>
                              {d.description}
                            </Text>
                          ))}
                      </YStack>
                    )}
                    <Text fontSize={12} color={Colors.secondaryText}>
                      {legTimes ? `${legTimes} · ${leg.duration} min` : `${leg.duration} min`}
                    </Text>
                  </YStack>
                </XStack>
              )
            })}

            {waiting >= 1 && (
              <XStack gap="$3" items="flex-start">
                <MaterialIcons
                  name="schedule"
                  size={24}
                  color={Colors.secondaryText}
                  style={{ width: 26, marginTop: 1 }}
                />
                <YStack flex={1} gap="$0.5">
                  <Text fontSize={15} fontWeight="600" color={Colors.secondaryText}>
                    Waiting & connections
                  </Text>
                  <Text fontSize={12} color={Colors.secondaryText}>
                    {waiting} min
                  </Text>
                </YStack>
              </XStack>
            )}
          </YStack>
        </YStack>
      </BottomSheetScrollView>

      {/* Fixed "Start journey" button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TouchableOpacity
          style={[styles.startBtn, busy && { opacity: Opacity.disabledMid }]}
          onPress={busy ? undefined : startJourney}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Start journey"
        >
          <Text fontSize={16} fontWeight="700" color={Colors.card}>
            {busy ? 'Starting…' : 'Start journey'}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  )
}

