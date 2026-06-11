import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { formatConnection } from '@/lib/connection'
import { formatTime, isToday, parseUtc } from '@/lib/datetime'
import {
  DIRECT_VERDICTS,
  type AssessedUnit,
  type OutageAssessment,
  type RouteDisruption,
  type UnitVerdict,
} from '@/features/journey/api/outageRelevance'
import { OutageTimeline } from '@/features/outages/OutageTimeline'
import { useTheme, Borders } from '@/theme'

type FailureDetail = components['schemas']['FailureDetail']

type VerdictStyle = {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  background: string
  border: string
  label: string
}

function reportMeta(unit: AssessedUnit): string {
  const count = `Reported ${unit.reportCount}×`
  if (!unit.lastReported) return count
  const d = parseUtc(unit.lastReported)
  const when = isToday(unit.lastReported)
    ? formatTime(unit.lastReported)
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${count} · last ${when}`
}

function verdictDetail(unit: AssessedUnit): string {
  switch (unit.verdict) {
    case 'on-your-platform':
      return 'Serves a platform your service uses here.'
    case 'shared-route':
      return 'Connects areas you pass through here.'
    case 'other-platform':
      return "Serves a platform your route doesn't appear to use."
    default:
      return "Couldn't confirm whether this is on your route."
  }
}

/**
 * A station's equipment that's actually on the rider's route here (on their platform or on the
 * shared vertical path). Off-route equipment is excluded entirely — we never surface it to the
 * rider, so it can't add noise or false alarm to a journey it doesn't affect.
 */
function routeUnits(station: OutageAssessment): AssessedUnit[] {
  return station.units.filter((u) => DIRECT_VERDICTS.has(u.verdict))
}

export const RouteAlerts = ({
  assessments,
  disruptions,
}: {
  assessments: OutageAssessment[]
  disruptions: RouteDisruption[]
}) => {
  const { Colors, Radii } = useTheme()
  // Lazily-fetched event timeline per failure, opened via the per-problem dropdown.
  const [expandedFailureId, setExpandedFailureId] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, FailureDetail>>({})
  const [loadingFailureId, setLoadingFailureId] = useState<number | null>(null)
  // Collapse state for every dropdown in the section, keyed by station name (for outage cards) or
  // `line:<name>` (for TfL disruption cards). Everything starts collapsed; absent ⇒ closed.
  const [stationOpen, setStationOpen] = useState<Record<string, boolean>>({})

  async function toggleTimeline(failureId: number) {
    if (expandedFailureId === failureId) {
      setExpandedFailureId(null)
      return
    }
    setExpandedFailureId(failureId)
    if (details[failureId]) return
    setLoadingFailureId(failureId)
    const { data } = await apiClient.GET('/failures/{failure_id}', {
      params: { path: { failure_id: failureId } },
    })
    if (data) setDetails((prev) => ({ ...prev, [failureId]: data }))
    setLoadingFailureId(null)
  }

  const VERDICTS = useMemo<Record<UnitVerdict, VerdictStyle>>(
    () => ({
      'on-your-platform': {
        icon: 'error',
        color: Colors.dangerDark,
        background: Colors.dangerBg,
        border: Colors.dangerBorder,
        label: 'On your route',
      },
      'shared-route': {
        icon: 'warning',
        color: Colors.warningDark,
        background: Colors.warningBg,
        border: Colors.warningBorder,
        label: 'On your path here',
      },
      'other-platform': {
        icon: 'info',
        color: Colors.text,
        background: Colors.searchBg,
        border: Colors.border,
        label: 'Likely a different platform',
      },
      unknown: {
        icon: 'help-outline',
        color: Colors.text,
        background: Colors.searchBg,
        border: Colors.border,
        label: 'Out of service',
      },
    }),
    [Colors],
  )

  // One assessed piece of equipment, with its verdict badge and lazy event timeline. A plain
  // render function (not a nested component) so it doesn't remount — and lose the open timeline —
  // each time the parent re-renders.
  const renderUnit = (unit: AssessedUnit, key: number) => {
    const v = VERDICTS[unit.verdict]
    return (
      <YStack
        key={key}
        gap="$1.5"
        p="$2.5"
        style={{
          backgroundColor: Colors.card,
          borderWidth: Borders.thin,
          borderColor: v.border,
          borderRadius: Radii.small,
        }}
      >
        <XStack gap="$2" items="center">
          <MaterialIcons name={v.icon} size={16} color={v.color} />
          <Text fontSize={13} fontWeight="700" flex={1} style={{ color: v.color }}>
            {v.label}
          </Text>
        </XStack>
        <Text fontSize={14} color={Colors.text}>
          {formatConnection(unit.connection, unit.equipmentType)}
        </Text>
        <Text fontSize={13} style={{ color: v.color }}>
          {verdictDetail(unit)}
        </Text>
        {unit.verified && (
          <XStack items="center" gap="$1">
            <MaterialIcons name="verified" size={13} color="#1d4ed8" />
            <Text fontSize={12} fontWeight="600" color="#1d4ed8">
              Verified on-site
              {unit.verificationCount > 1 ? ` (${unit.verificationCount}×)` : ''}
            </Text>
          </XStack>
        )}
        <Text fontSize={12} color={Colors.secondaryText}>
          {reportMeta(unit)}
          {unit.estimated ? ' · location estimated' : ''}
        </Text>

        {/* Per-problem dropdown: lazily loads and shows the full event timeline. */}
        <XStack
          items="center"
          gap="$1"
          mt="$0.5"
          onPress={() => toggleTimeline(unit.failureId)}
          pressStyle={{ opacity: 0.6 }}
        >
          <Text fontSize={12} fontWeight="600" style={{ color: v.color }}>
            {expandedFailureId === unit.failureId ? 'Hide timeline' : 'View timeline'}
          </Text>
          <MaterialIcons
            name={expandedFailureId === unit.failureId ? 'expand-less' : 'expand-more'}
            size={16}
            color={v.color}
          />
        </XStack>
        {expandedFailureId === unit.failureId &&
          (loadingFailureId === unit.failureId ? (
            <Spinner color={Colors.secondaryText} />
          ) : details[unit.failureId] ? (
            <YStack pt="$1">
              <OutageTimeline
                reports={details[unit.failureId].reports}
                verifications={details[unit.failureId].verifications}
                resolvedAt={details[unit.failureId].resolved_at}
                resolutionDescription={details[unit.failureId].resolution_description}
              />
            </YStack>
          ) : null)}
      </YStack>
    )
  }

  // A station and all its broken equipment, in a single collapsible card. The header toggles the
  // station open/closed; every problem at the station lives inside, so a station's issues are
  // never split across the view.
  const renderStation = (station: OutageAssessment) => {
    const units = routeUnits(station)
    // Every station starts collapsed; the header alone tells the rider it's on their route.
    const open = stationOpen[station.stationName] ?? false
    const count = units.length
    return (
      <YStack
        key={station.stationName}
        p="$3"
        gap={open ? '$2.5' : '$0'}
        style={{
          borderWidth: Borders.medium,
          borderColor: Colors.dangerBorder,
          borderRadius: Radii.button,
          backgroundColor: Colors.dangerBg,
        }}
      >
        <XStack
          items="center"
          gap="$2"
          onPress={() =>
            setStationOpen((prev) => ({
              ...prev,
              [station.stationName]: !(prev[station.stationName] ?? false),
            }))
          }
          pressStyle={{ opacity: 0.6 }}
        >
          <MaterialIcons name="error" size={18} color={Colors.dangerDark} />
          <YStack flex={1} gap="$0.5">
            <Text fontSize={15} fontWeight="700" color={Colors.text}>
              {station.stationName}
            </Text>
            <Text fontSize={13} fontWeight="600" style={{ color: Colors.dangerDark }}>
              On your route · {count} {count === 1 ? 'issue' : 'issues'}
            </Text>
          </YStack>
          <MaterialIcons
            name={open ? 'expand-less' : 'expand-more'}
            size={22}
            color={Colors.secondaryText}
          />
        </XStack>
        {open && units.map((unit, i) => renderUnit(unit, i))}
      </YStack>
    )
  }

  // A TfL service disruption, grouped by line into the same collapsible-card shape as the station
  // cards. These sit on a line the rider is on, so they always count as on-route.
  const renderDisruptionGroup = (group: { line: string; descriptions: string[] }) => {
    const key = `line:${group.line}`
    const open = stationOpen[key] ?? false
    const count = group.descriptions.length
    return (
      <YStack
        key={key}
        p="$3"
        gap={open ? '$2.5' : '$0'}
        style={{
          borderWidth: Borders.medium,
          borderColor: Colors.dangerBorder,
          borderRadius: Radii.button,
        }}
      >
        <XStack
          items="center"
          gap="$2"
          onPress={() => setStationOpen((prev) => ({ ...prev, [key]: !(prev[key] ?? false) }))}
          pressStyle={{ opacity: 0.6 }}
        >
          <MaterialIcons name="error" size={18} color={Colors.dangerDark} />
          <YStack flex={1} gap="$0.5">
            <Text fontSize={15} fontWeight="700" color={Colors.text}>
              {group.line}
            </Text>
            <Text fontSize={13} fontWeight="600" style={{ color: Colors.dangerDark }}>
              On your route · {count} {count === 1 ? 'disruption' : 'disruptions'}
            </Text>
          </YStack>
          <MaterialIcons
            name={open ? 'expand-less' : 'expand-more'}
            size={22}
            color={Colors.secondaryText}
          />
        </XStack>
        {open &&
          group.descriptions.map((description, i) => (
            <YStack
              key={i}
              p="$2.5"
              style={{
                backgroundColor: Colors.dangerBg,
                borderWidth: Borders.thin,
                borderColor: Colors.dangerBorder,
                borderRadius: Radii.small,
              }}
            >
              <Text fontSize={14} color={Colors.dangerDark}>
                {description}
              </Text>
            </YStack>
          ))}
      </YStack>
    )
  }

  // TfL service disruptions grouped by line, so each line gets a single dropdown.
  const disruptionGroups = useMemo(() => {
    const byLine = new Map<string, string[]>()
    for (const d of disruptions) {
      const descriptions = byLine.get(d.line) ?? []
      descriptions.push(d.description)
      byLine.set(d.line, descriptions)
    }
    return [...byLine].map(([line, descriptions]) => ({ line, descriptions }))
  }, [disruptions])

  // Only stations with equipment actually on the rider's route are shown — off-route outages are
  // dropped entirely so they never appear as alerts. Every card stays collapsed until tapped.
  const routeStations = useMemo(
    () => assessments.filter((station) => routeUnits(station).length > 0),
    [assessments],
  )

  const hasAnything = disruptions.length > 0 || routeStations.length > 0
  if (!hasAnything) return null

  return (
    <YStack gap="$3">
      <Text
        fontSize={16}
        fontWeight="700"
        color={Colors.text}
        mt="$3"
        pt="$3"
        style={{ borderTopWidth: Borders.thin, borderTopColor: Colors.border }}
      >
        Disruptions on this route
      </Text>

      {disruptionGroups.map(renderDisruptionGroup)}

      {routeStations.map(renderStation)}
    </YStack>
  )
}
