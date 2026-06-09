import { useEffect, useMemo, useState } from 'react'
import { Spinner, Text, YStack } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { Heading } from '@/components/Heading'
import { useAuth } from '@/features/auth/context/AuthContext'
import { NoteModal } from '@/features/home/components/NoteModal'
import { OutageReportCard } from '@/features/home/components/OutageReportCard'
import { useOutages } from '@/features/outages'
import { useTheme } from '@/theme'

type OutageReport = components['schemas']['OutageReportSummary']

type ReportsStatusProps = {
  loading: boolean
  reports: OutageReport[]
}

export const ReportsStatus = ({ loading, reports }: ReportsStatusProps) => {
  const { Colors, Radii } = useTheme()
  const { user } = useAuth()
  const { markViewed } = useOutages()
  const isTrusted = user?.role === 'trusted'
  const [expandedFailureId, setExpandedFailureId] = useState<number | null>(null)
  const [verifyingFailureId, setVerifyingFailureId] = useState<number | null>(null)
  const [resolvingFailureId, setResolvingFailureId] = useState<number | null>(null)
  // The failure whose "Verify on-site" / "Mark Resolved" note dialog is open, if any.
  const [verifyTargetId, setVerifyTargetId] = useState<number | null>(null)
  const [resolveTargetId, setResolveTargetId] = useState<number | null>(null)

  // Group reports by failure_id. Preserves order of first occurrence (newest failure first,
  // since the feed is sorted newest breakdown_time first). The card builds its own timeline, so
  // within-group order here only picks a representative report (reports[0]) for the header.
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

  // Mark every outage shown here as viewed, so if one is later resolved it lingers as a "Resolved"
  // card for this user instead of silently disappearing.
  useEffect(() => {
    for (const group of issueGroups) markViewed(group.failureId)
  }, [issueGroups, markViewed])

  async function handleVerify(failureId: number, description?: string) {
    setVerifyingFailureId(failureId)
    await apiClient.PATCH('/failures/{failure_id}/verify', {
      params: { path: { failure_id: failureId } },
      body: { description: description ?? null },
    })
    setVerifyingFailureId(null)
    setVerifyTargetId(null)
  }

  async function handleResolve(failureId: number, description?: string) {
    setResolvingFailureId(failureId)
    await apiClient.PATCH('/failures/{failure_id}/resolve', {
      params: { path: { failure_id: failureId } },
      body: { description: description ?? null },
    })
    setResolvingFailureId(null)
    setResolveTargetId(null)
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
          onVerify={isTrusted ? () => setVerifyTargetId(failureId) : undefined}
          verifying={verifyingFailureId === failureId}
          onResolve={isTrusted ? () => setResolveTargetId(failureId) : undefined}
          resolving={resolvingFailureId === failureId}
        />
      ))}

      <NoteModal
        visible={verifyTargetId !== null}
        submitting={verifyingFailureId !== null && verifyingFailureId === verifyTargetId}
        title="Verify outage on-site"
        subtitle="Confirm you've checked this equipment in person. Add a note if helpful (optional)."
        placeholder="e.g. Engineer attending, no ETA"
        confirmLabel="Confirm"
        busyLabel="Verifying…"
        onConfirm={(description) => {
          if (verifyTargetId !== null) void handleVerify(verifyTargetId, description)
        }}
        onCancel={() => setVerifyTargetId(null)}
      />

      <NoteModal
        visible={resolveTargetId !== null}
        submitting={resolvingFailureId !== null && resolvingFailureId === resolveTargetId}
        title="Mark outage resolved"
        subtitle="Confirm this equipment is working again. Add a reason if helpful (optional)."
        placeholder="e.g. Lift repaired and tested"
        confirmLabel="Mark Resolved"
        busyLabel="Resolving…"
        accentColor={Colors.successDark}
        onConfirm={(description) => {
          if (resolveTargetId !== null) void handleResolve(resolveTargetId, description)
        }}
        onCancel={() => setResolveTargetId(null)}
      />
    </YStack>
  )
}
