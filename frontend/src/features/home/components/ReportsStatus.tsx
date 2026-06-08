import { useMemo, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'
import type { components } from '@/api/schema.d'
import { Heading } from '@/components/Heading'
import { useTheme } from '@/theme'
import { OutageReportCard } from '@/features/home/components/OutageReportCard'

type OutageReport = components['schemas']['OutageReportSummary']

type ReportsStatusProps = {
  loading: boolean
  reports: OutageReport[]
}

export const ReportsStatus = ({ loading, reports }: ReportsStatusProps) => {
  const { Colors, Radii } = useTheme()
  const [expandedFailureId, setExpandedFailureId] = useState<number | null>(null)

  // Group reports by failure_id. Preserves order of first occurrence (newest failure first,
  // since the feed is sorted newest breakdown_time first). Within each group, sort oldest-first
  // so the expanded detail reads chronologically.
  const issueGroups = useMemo(() => {
    const map = new Map<number, OutageReport[]>()
    for (const report of reports) {
      const group = map.get(report.failure_id) ?? []
      map.set(report.failure_id, [...group, report])
    }
    return Array.from(map.entries()).map(([failureId, group]) => ({
      failureId,
      reports: [...group].sort((a, b) => a.breakdown_time.localeCompare(b.breakdown_time)),
    }))
  }, [reports])

  if (loading) {
    return (
      <YStack
        mx="$4"
        mt="$4"
        p="$5"
        items="center"
        style={{ backgroundColor: Colors.searchBg, borderRadius: Radii.button }}
      >
        <Spinner color={Colors.secondaryText} />
      </YStack>
    )
  }

  if (issueGroups.length === 0) {
    return (
      <YStack
        mx="$4"
        mt="$4"
        p="$5"
        items="center"
        gap="$3"
        style={{ backgroundColor: Colors.successBg, borderRadius: Radii.button }}
      >
        <YStack
          style={{
            width: 48,
            height: 48,
            borderRadius: Radii.pill,
            backgroundColor: Colors.successDark,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text color={Colors.card} fontSize={24} fontWeight="700">
            ✓
          </Text>
        </YStack>
        <Heading fontSize={18} color={Colors.successDark}>
          No known issues
        </Heading>
      </YStack>
    )
  }

  return (
    <YStack mx="$4" mt="$4" gap="$2">
      {issueGroups.map(({ failureId, reports: group }) => (
        <OutageReportCard
          key={failureId}
          reports={group}
          expanded={expandedFailureId === failureId}
          onToggle={() => setExpandedFailureId(expandedFailureId === failureId ? null : failureId)}
        />
      ))}
    </YStack>
  )
}
