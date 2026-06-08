import { useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { Heading } from '@/components/Heading'
import { useAuth } from '@/features/auth/context/AuthContext'
import { OutageReportCard } from '@/features/home/components/OutageReportCard'
import { useTheme } from '@/theme'

type OutageReport = components['schemas']['OutageReportSummary']

type ReportsStatusProps = {
  loading: boolean
  reports: OutageReport[]
}

export const ReportsStatus = ({ loading, reports }: ReportsStatusProps) => {
  const { Colors, Radii } = useTheme()
  const { user } = useAuth()
  const isTrusted = user?.role === 'trusted'
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [verifyingId, setVerifyingId] = useState<number | null>(null)
  const [resolvingId, setResolvingId] = useState<number | null>(null)

  async function handleVerify(reportId: number) {
    setVerifyingId(reportId)
    await apiClient.PATCH('/outage-reports/{report_id}/verify', {
      params: { path: { report_id: reportId } },
    })
    setVerifyingId(null)
  }

  async function handleResolve(failureId: number) {
    setResolvingId(failureId)
    await apiClient.PATCH('/failures/{failure_id}/resolve', {
      params: { path: { failure_id: failureId } },
    })
    setResolvingId(null)
  }

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
          onVerify={isTrusted ? () => handleVerify(r.id) : undefined}
          verifying={verifyingId === r.id}
          onResolve={isTrusted ? () => handleResolve(r.failure_id) : undefined}
          resolving={resolvingId === r.failure_id}
        />
      ))}
    </YStack>
  )
}
