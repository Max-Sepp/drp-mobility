import { useState } from 'react'
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
  const [expandedId, setExpandedId] = useState<number | null>(null)

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

  if (reports.length === 0) {
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
      {reports.map((r) => (
        <OutageReportCard
          key={r.id}
          report={r}
          expanded={expandedId === r.id}
          onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
        />
      ))}
    </YStack>
  )
}
