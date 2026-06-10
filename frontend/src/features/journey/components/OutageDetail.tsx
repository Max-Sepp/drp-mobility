import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { formatTime, isToday, parseUtc } from '@/lib/datetime'
import type {
  AssessedUnit,
  OutageAssessment,
  UnitVerdict,
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

export const OutageDetail = ({ assessments }: { assessments: OutageAssessment[] }) => {
  const { Colors, Radii } = useTheme()
  // Lazily-fetched event timeline per failure, opened via the per-problem dropdown.
  const [expandedFailureId, setExpandedFailureId] = useState<number | null>(null)
  const [details, setDetails] = useState<Record<number, FailureDetail>>({})
  const [loadingFailureId, setLoadingFailureId] = useState<number | null>(null)
  // Which station cards are expanded to show full unit details.
  const [expandedStations, setExpandedStations] = useState<Set<string>>(new Set())

  function toggleStation(name: string) {
    setExpandedStations((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

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
  if (assessments.length === 0) return null

  const onRoute = (u: AssessedUnit) =>
    u.verdict === 'on-your-platform' || u.verdict === 'shared-route'
  const offRoute = (u: AssessedUnit) => !onRoute(u)

  function offRouteSummary(units: AssessedUnit[]): string | null {
    const broken = units.filter((u) => offRoute(u) && u.equipmentType === 'lift').length
    if (broken === 0) return null
    return broken === 1
      ? '1 lift broken (not on your route)'
      : `${broken} lifts broken (not on your route)`
  }

  return (
    <YStack gap="$3" mt="$4">
      <YStack style={{ height: 1, backgroundColor: Colors.border }} />
      <Text fontSize={16} fontWeight="700" color={Colors.text}>
        Accessibility alerts on this route
      </Text>
      {assessments.map((station) => {
        const routeUnits = station.units.filter(onRoute)
        const summary = offRouteSummary(station.units)

        // Station has no on-route issues — show a collapsible amber card.
        if (routeUnits.length === 0) {
          if (!summary) return null
          const offRouteUnits = station.units.filter(offRoute)
          const offBroken = offRouteUnits.filter((u) => u.equipmentType === 'lift').length
          const offIsExpanded = expandedStations.has(station.stationName)
          const offLabel = offBroken === 1 ? '1 lift broken ' : `${offBroken} lifts broken `
          return (
            <YStack
              key={station.stationName}
              style={{
                borderWidth: Borders.medium,
                borderColor: Colors.warningBorder,
                borderRadius: Radii.button,
                backgroundColor: Colors.warningBg,
                overflow: 'hidden',
              }}
            >
              <XStack
                gap="$2"
                px="$3"
                py="$2.5"
                items="center"
                onPress={() => toggleStation(station.stationName)}
                pressStyle={{ opacity: 0.7 }}
              >
                <MaterialIcons name="warning-amber" size={15} color={Colors.warningDark} />
                <Text fontSize={13} color={Colors.warningDark} flex={1}>
                  <Text fontWeight="700">{station.stationName}:</Text> {offLabel}
                  <Text fontWeight="700">(not on your route)</Text>
                </Text>
                <MaterialIcons
                  name={offIsExpanded ? 'expand-less' : 'expand-more'}
                  size={18}
                  color={Colors.warningDark}
                />
              </XStack>
              {offIsExpanded && (
                <YStack gap="$2.5" p="$3">
                  {offRouteUnits.map((unit, i) => {
                    const v = VERDICTS[unit.verdict]
                    return (
                      <YStack
                        key={i}
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
                          {unit.connection}
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
                        <XStack
                          items="center"
                          gap="$1"
                          mt="$0.5"
                          onPress={() => toggleTimeline(unit.failureId)}
                          pressStyle={{ opacity: 0.6 }}
                        >
                          <Text fontSize={12} fontWeight="600" style={{ color: v.color }}>
                            {expandedFailureId === unit.failureId
                              ? 'Hide timeline'
                              : 'View timeline'}
                          </Text>
                          <MaterialIcons
                            name={
                              expandedFailureId === unit.failureId ? 'expand-less' : 'expand-more'
                            }
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
                                resolutionDescription={
                                  details[unit.failureId].resolution_description
                                }
                              />
                            </YStack>
                          ) : null)}
                      </YStack>
                    )
                  })}
                </YStack>
              )}
            </YStack>
          )
        }

        const isExpanded = expandedStations.has(station.stationName)
        const brokenOnRoute = station.journeyRelevantLifts.broken
        const totalOnRoute = station.journeyRelevantLifts.total
        const allDown = brokenOnRoute > 0 && totalOnRoute > 0 && brokenOnRoute >= totalOnRoute
        const headerBg = allDown ? Colors.dangerBg : Colors.warningBg
        const headerBorder = allDown ? Colors.dangerBorder : Colors.warningBorder
        const headerColor = allDown ? Colors.dangerDark : Colors.warningDark
        const routeSummary =
          totalOnRoute > 1
            ? `${brokenOnRoute}/${totalOnRoute} lifts on your route`
            : 'lift on your route broken'

        return (
          <YStack
            key={station.stationName}
            style={{
              borderWidth: Borders.medium,
              borderColor: headerBorder,
              borderRadius: Radii.button,
              backgroundColor: headerBg,
              overflow: 'hidden',
            }}
          >
            {/* Compact header — always visible, tap to expand */}
            <XStack
              gap="$2"
              px="$3"
              py="$2.5"
              items="center"
              onPress={() => toggleStation(station.stationName)}
              pressStyle={{ opacity: 0.7 }}
              style={{ backgroundColor: headerBg }}
            >
              <MaterialIcons name="warning-amber" size={15} color={headerColor} />
              <Text fontSize={13} color={headerColor} flex={1}>
                <Text fontWeight="700">{station.stationName}:</Text> {routeSummary}
              </Text>
              <MaterialIcons
                name={isExpanded ? 'expand-less' : 'expand-more'}
                size={18}
                color={headerColor}
              />
            </XStack>

            {/* Full unit detail — shown when expanded */}
            {isExpanded && (
              <YStack gap="$2.5" p="$3">
                {routeUnits.map((unit, i) => {
                  const v = VERDICTS[unit.verdict]
                  return (
                    <YStack
                      key={i}
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
                        {unit.connection}
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
                          name={
                            expandedFailureId === unit.failureId ? 'expand-less' : 'expand-more'
                          }
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
                })}

                {/* Off-route broken lifts — collapsed to a single footnote line. */}
                {summary && (
                  <XStack gap="$2" items="center" pt="$0.5">
                    <MaterialIcons name="info-outline" size={13} color={Colors.secondaryText} />
                    <Text fontSize={12} color={Colors.secondaryText}>
                      {summary}
                    </Text>
                  </XStack>
                )}
              </YStack>
            )}
          </YStack>
        )
      })}
    </YStack>
  )
}
