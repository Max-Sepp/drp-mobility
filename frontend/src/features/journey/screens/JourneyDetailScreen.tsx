import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { SubmitBar } from '@/features/reporting/components/SubmitBar'
import { useStations } from '@/features/stations'
import type { JourneyDetailScreenProps } from '@/navigation/types'
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
import { useAuth } from '@/features/auth'
import { useTheme, Borders, Heights, Opacity } from '@/theme'

export const JourneyDetailScreen = ({ navigation, route }: JourneyDetailScreenProps) => {
  const { Colors, Radii } = useTheme()
  const { journey, from, to, outages = [], level, savedId, tags } = route.params

  const [currentSavedId, setCurrentSavedId] = useState<string | null>(savedId ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (savedId) return
    let active = true
    ;(async () => {
      const saved = await loadSavedJourneys()
      if (!active) return
      const key = journeyKey(journey, from, to)
      const match = saved.find((s) => journeyKey(s.journey, s.from, s.to) === key)
      if (match) setCurrentSavedId(match.id)
    })()
    return () => {
      active = false
    }
  }, [savedId, journey, from, to])

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

  async function toggleSave() {
    if (busy) return
    setBusy(true)
    try {
      if (currentSavedId) {
        await deleteJourney(currentSavedId)
        setCurrentSavedId(null)
      } else {
        const record = await saveJourney({ from, to, level: level ?? null, outages, journey })
        setCurrentSavedId(record.id)
      }
    } catch {
      Alert.alert('Error', 'Could not update your saved journeys. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // Begin following the route. A journey must be saved to be followed, so save it first if the
  // rider hasn't already (silently — the save toggle simply flips to "Saved" afterwards), then
  // hand off to the active-journey screen.
  async function startJourney() {
    if (busy) return
    setBusy(true)
    try {
      let savedJourneyId = currentSavedId
      if (!savedJourneyId) {
        const record = await saveJourney({ from, to, level: level ?? null, outages, journey })
        savedJourneyId = record.id
        setCurrentSavedId(record.id)
      }
      await startActiveJourney({
        savedId: savedJourneyId,
        journey,
        from,
        to,
        outages,
        level: level ?? null,
      })
      navigation.replace('ActiveJourney', {
        savedId: savedJourneyId,
        journey,
        from,
        to,
        outages,
        level: level ?? null,
      })
    } catch {
      Alert.alert('Error', 'Could not start this journey. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const { user } = useAuth()
  const fare = fareLabel(journey, user?.traveller_type, user?.railcard)
  const legTotal = journey.legs.reduce((sum, leg) => sum + leg.duration, 0)
  const waiting = journey.duration - legTotal
  const saved = currentSavedId !== null

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Journey details" onBack={() => navigation.goBack()} />}
      footer={<SubmitBar label="Start journey" submitting={busy} onPress={startJourney} />}
    >
      <YStack px="$5" mt="$4" gap="$4">
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

          {/* Save / remove toggle */}
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
                    onStationPress={openStation}
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
                aria-label="Waiting and connections"
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
    </FormScreenLayout>
  )
}
