import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { useStations } from '@/features/stations'
import type { JourneyDetailScreenProps } from '@/navigation/types'
import { resolveStationName } from '../api/accessibility'
import { assessOutages } from '../api/outageRelevance'
import type { Leg } from '../api/tfl'
import { deleteJourney, journeyKey, loadSavedJourneys, saveJourney } from '../api/savedJourneys'
import {
  clockTime,
  fareLabel,
  humanizeSummary,
  LegStations,
  modeIcon,
  modeLabel,
  RouteTags,
  stripStationSuffix,
} from '../components/legDisplay'
import { OutageDetail } from '../components/OutageDetail'

/** The line + direction a transit leg runs on, e.g. "Victoria towards Brixton". */
function lineLabel(leg: Leg): string | null {
  const option = leg.routeOptions?.[0]
  if (!option?.name) return null
  const direction = option.directions?.find(Boolean)
  return direction ? `${option.name} towards ${stripStationSuffix(direction)}` : option.name
}

export const JourneyDetailScreen = ({ navigation, route }: JourneyDetailScreenProps) => {
  const { journey, from, to, outages = [], level, savedId, tags } = route.params

  // A journey opened from the saved list arrives with its id; one opened from a fresh result
  // doesn't, so we look it up by signature to show the right Save/Remove state.
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

  // Resolve TfL station names to our own list so each links through to its detail screen.
  const { stations } = useStations()
  const stationNames = useMemo(() => stations.map((s) => s.name), [stations])
  const resolveStation = useCallback(
    (commonName: string) => resolveStationName(commonName, stationNames),
    [stationNames],
  )
  const openStation = (station: string) => navigation.navigate('Station', { station })

  // Assess each flagged station's broken equipment against this journey, so we can say whether it
  // actually affects the route rather than just that the station has an outage.
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

  const fare = fareLabel(journey)
  const legTotal = journey.legs.reduce((sum, leg) => sum + leg.duration, 0)
  const waiting = journey.duration - legTotal
  const saved = currentSavedId !== null

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Journey details" onBack={() => navigation.goBack()} />}
      footer={null}
    >
      <YStack px="$5" mt="$4" gap="$4">
        {/* Summary: times, duration, fare, and the save toggle. */}
        <YStack
          p="$4"
          gap="$3"
          style={{
            borderWidth: 1.5,
            borderColor: '#d1d5db',
            borderRadius: 10,
            backgroundColor: '#f9fafb',
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
                    color="#6b7280"
                    style={{ width: 18 }}
                  />
                  <Text fontSize={14} color="#111827" flex={1}>
                    {from.label}
                  </Text>
                </XStack>
              )}
              {to && (
                <XStack gap="$2" items="center">
                  <MaterialIcons name="place" size={16} color="#6b7280" style={{ width: 18 }} />
                  <Text fontSize={14} color="#111827" flex={1}>
                    {to.label}
                  </Text>
                </XStack>
              )}
            </YStack>
          )}

          <XStack items="center" justify="space-between">
            <XStack items="baseline" gap="$2">
              <Text fontSize={22} fontWeight="700" color="#111827">
                {journey.duration} min
              </Text>
              {fare && (
                <Text fontSize={16} fontWeight="600" color="#16a34a">
                  {fare}
                </Text>
              )}
            </XStack>
            <Text fontSize={16} color="#374151">
              {clockTime(journey.startDateTime)} → {clockTime(journey.arrivalDateTime)}
            </Text>
          </XStack>

          <XStack
            items="center"
            justify="center"
            gap="$2"
            pressStyle={{ opacity: 0.8 }}
            onPress={toggleSave}
            opacity={busy ? 0.6 : 1}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Remove from saved journeys' : 'Save this journey'}
            style={{
              height: 48,
              borderRadius: 10,
              borderWidth: 1.5,
              borderColor: saved ? '#d1d5db' : '#111827',
              backgroundColor: saved ? '#f9fafb' : '#111827',
            }}
          >
            <MaterialIcons
              name={saved ? 'bookmark' : 'bookmark-border'}
              size={20}
              color={saved ? '#374151' : 'white'}
            />
            <Text fontSize={15} fontWeight="700" color={saved ? '#374151' : 'white'}>
              {saved ? 'Saved — tap to remove' : 'Save journey'}
            </Text>
          </XStack>
        </YStack>

        <OutageDetail assessments={outageAssessments} />

        {/* Per-leg breakdown with as much detail as TfL provides. */}
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
                  color="#2563eb"
                  accessibilityLabel={modeLabel(leg.mode.name)}
                  style={{ width: 26, marginTop: 1 }}
                />
                <YStack flex={1} gap="$1">
                  <Text fontSize={15} fontWeight="600" color="#111827">
                    {humanizeSummary(leg.instruction.summary, [from, to])}
                  </Text>
                  {line && (
                    <Text fontSize={13} color="#2563eb" fontWeight="600">
                      {line}
                    </Text>
                  )}
                  <LegStations
                    leg={leg}
                    resolveStation={resolveStation}
                    onStationPress={openStation}
                  />
                  {/* TfL's detailed text restates the line/direction for transit legs, so only
                      show it when there's no line label (e.g. walking) and it adds something. */}
                  {!line &&
                    leg.instruction.detailed &&
                    leg.instruction.detailed !== leg.instruction.summary && (
                      <Text fontSize={13} color="#374151">
                        {humanizeSummary(leg.instruction.detailed, [from, to])}
                      </Text>
                    )}
                  {stopCount > 0 && (
                    <Text fontSize={13} color="#6b7280">
                      {stopCount} {stopCount === 1 ? 'stop' : 'stops'}
                    </Text>
                  )}
                  <Text fontSize={12} color="#6b7280">
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
                color="#6b7280"
                accessibilityLabel="Waiting and connections"
                style={{ width: 26, marginTop: 1 }}
              />
              <YStack flex={1} gap="$0.5">
                <Text fontSize={15} fontWeight="600" color="#6b7280">
                  Waiting & connections
                </Text>
                <Text fontSize={12} color="#6b7280">
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
