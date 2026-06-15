// Bottom sheet showing station detail — platform access and live outage reports.
// Always mounted in MapHomeScreen; opens when `station` prop is set, closes when null.
// Reporting opens ReportSheet (sibling in MapHomeScreen). JourneyPlanner navigates on the stack.

import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { SheetHeader } from '@/components/SheetHeader'
import { PlatformAccessCard } from '@/features/home/components/PlatformAccessCard'
import { ReportsStatus } from '@/features/home/components/ReportsStatus'
import { StationAlertBanner } from '@/features/home/components/StationAlertBanner'
import { StationAdditionalInfoCard } from '@/features/home/components/StationAdditionalInfoCard'
import { StationInfoCard } from '@/features/home/components/StationInfoCard'
import { useOutages } from '@/features/outages'
import { overallSeverity } from '@/features/outages/severity'
import { useStationAlerts, worstAlertSeverity } from '@/features/outages/stationAlerts'
import { StepFreeBadge, useStations } from '@/features/stations'
import { resolveToPostcode, type ResolvedLocation } from '@/features/journey/api/geocode'
import { useAppLocation } from '@/lib/LocationContext'
import { alertOffline, isOfflineError } from '@/lib/offline'
import type { JourneyPlan } from '@/features/home/components/JourneyPlannerSheet'
import { useTheme, Heights, Spacing } from '@/theme'
import { useSheetStack } from '@/components/SheetStack'

const SCREEN_H = Dimensions.get('window').height
const COLLAPSED_H = 84
// 8 (paddingTop) + 50 (button height) + 8 (gap) = 66 reserved for top buttons
const TOP_BUTTON_RESERVE = 66

type Props = {
  station: string | null
  onClose: () => void
  onReportPress: () => void
  onOpenJourney: (plan: JourneyPlan) => void
  onHeightChange?: (height: number) => void
}

export function StationSheet({
  station,
  onClose,
  onReportPress,
  onOpenJourney,
  onHeightChange,
}: Props) {
  const { Colors, Radii, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        actionsRow: {
          flexDirection: 'row',
          gap: Spacing.md,
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.lg,
        },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: Colors.separator,
          marginHorizontal: Spacing.lg,
          marginBottom: Spacing.xs,
        },
        actionBtn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          height: Heights.button,
          borderRadius: Radii.button,
          backgroundColor: Colors.blue,
          ...Shadows.card,
        },
        actionBtnDisabled: {
          backgroundColor: Colors.secondaryText,
        },
        actionBtnOutline: {
          backgroundColor: Colors.searchBg,
          ...Shadows.card,
        },
      }),
    [Colors, Radii, Shadows],
  )
  const insets = useSafeAreaInsets()
  const snapPoints = useMemo(
    () => [COLLAPSED_H, SCREEN_H * 0.52, SCREEN_H - insets.top - TOP_BUTTON_RESERVE],
    [insets.top],
  )
  const cachedCoords = useAppLocation()
  const [goingHere, setGoingHere] = useState(false)
  const [snapIndex, setSnapIndex] = useState(-1)
  const sheetRef = useRef<BottomSheetRef>(null)
  // Suppresses onClose when the sheet is hidden programmatically (not by the user).
  const programmaticClose = useRef(false)
  const { register, push, onClosed } = useSheetStack()

  const { stations } = useStations()
  const stationDetail = useMemo(() => stations.find((s) => s.name === station), [stations, station])

  const { reports: allReports, loading } = useOutages()
  const reports = useMemo(
    () =>
      allReports.filter((r) => r.failure.equipment.station.name === station && r.source !== 'tfl'),
    [allReports, station],
  )
  // All reports for this station (including TfL-sourced) used for platform disruption overlay.
  const stationReports = useMemo(
    () => allReports.filter((r) => r.failure.equipment.station.name === station),
    [allReports, station],
  )
  const { alerts } = useStationAlerts(stationDetail?.id)
  const badgeSeverity = useMemo(() => overallSeverity(reports), [reports])
  const hasIssues = reports.length > 0 || alerts.length > 0
  const issueSeverity =
    badgeSeverity === 'danger' || worstAlertSeverity(alerts) === 'danger' ? 'danger' : 'warning'

  // Imperatively open or close the sheet when the station prop changes.
  // The index prop alone is unreliable for re-triggering gorhom after mount.
  useEffect(() => {
    if (station) {
      push('station') // puts it on the stack; registered open() handles snapToIndex + flag
    } else {
      programmaticClose.current = true
      sheetRef.current?.close()
    }
    setGoingHere(false)
  }, [station]) // eslint-disable-line react-hooks/exhaustive-deps

  // Register with the global sheet stack so push('report') can hide this sheet and
  // automatically restore it when the report sheet closes.
  useEffect(() => {
    return register(
      'station',
      () => {
        programmaticClose.current = false
        sheetRef.current?.snapToIndex(1)
      },
      () => {
        programmaticClose.current = true
        sheetRef.current?.close()
      },
    )
  }, [register])

  function handleAnimate(fromIndex: number, toIndex: number) {
    // Fire onClose as soon as the close animation begins (not when it ends) so the
    // search sheet restores in parallel rather than sequentially after this sheet finishes.
    if (toIndex === -1 && !programmaticClose.current) {
      programmaticClose.current = true
      onClose()
    }
  }

  function handleChange(index: number) {
    setSnapIndex(index)
    onHeightChange?.(index >= 0 ? snapPoints[index] : 0)
    if (index === -1) {
      onClosed('station')
      // Fallback: if handleAnimate didn't fire (gorhom edge case), call onClose directly.
      if (!programmaticClose.current) onClose()
    }
  }

  async function handleGoHere() {
    if (!station) return
    setGoingHere(true)
    try {
      const toResult = await resolveToPostcode(station)
      if ('error' in toResult) {
        Alert.alert(
          'Station error',
          `Couldn't find a postcode for ${station}. Try planning manually.`,
        )
        return
      }
      // Prefer the station's TfL id so the journey ends at the station itself; the postcode is
      // kept for the label/snapshot and as a fallback when the id is missing (unmatched seed row).
      const to: ResolvedLocation = {
        postcode: toResult.postcode,
        label: station,
        tflId: stationDetail?.tfl_id ?? undefined,
      }

      let from: ResolvedLocation | undefined
      if (cachedCoords) {
        const fromResult = await resolveToPostcode(
          `${cachedCoords.latitude},${cachedCoords.longitude}`,
        )
        if (!('error' in fromResult)) {
          from = { postcode: fromResult.postcode, label: 'Current location' }
        }
      }

      onOpenJourney({ initialFrom: from, initialTo: to })
    } catch (err) {
      if (isOfflineError(err)) alertOffline('plan a journey')
    } finally {
      setGoingHere(false)
    }
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleChange}
      onAnimate={handleAnimate}
    >
      <SheetHeader
        title={station ?? ''}
        subtitle="Underground station"
        onClose={() => sheetRef.current?.close()}
      />

      {/* Status badges — on their own row so the station name is never truncated. */}
      {(stationDetail?.step_free || hasIssues) && (
        <XStack gap="$2" flexWrap="wrap" px="$4" pb="$2">
          {stationDetail?.step_free && <StepFreeBadge value={stationDetail.step_free} />}
          {hasIssues && (
            <XStack
              items="center"
              gap="$1.5"
              px="$2"
              py="$1"
              style={{
                backgroundColor: issueSeverity === 'warning' ? Colors.warningBg : Colors.dangerBg,
                borderRadius: 6,
              }}
            >
              <MaterialIcons
                name="warning"
                size={16}
                color={issueSeverity === 'warning' ? Colors.warningDark : Colors.dangerDark}
              />
              <Text
                fontSize={13}
                fontWeight="600"
                color={issueSeverity === 'warning' ? Colors.warningDark : Colors.dangerDark}
              >
                Known issues
              </Text>
            </XStack>
          )}
        </XStack>
      )}

      {/* Action buttons row */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, goingHere && styles.actionBtnDisabled]}
          activeOpacity={0.8}
          onPress={goingHere ? undefined : handleGoHere}
        >
          <MaterialIcons
            name="directions"
            size={18}
            color={Colors.card}
            style={{ marginRight: 6 }}
          />
          <Text fontSize={14} fontWeight="600" color={Colors.card}>
            {goingHere ? 'Getting location…' : 'Directions'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline]}
          activeOpacity={0.8}
          onPress={onReportPress}
        >
          <MaterialIcons name="flag" size={18} color={Colors.text} style={{ marginRight: 6 }} />
          <Text fontSize={14} fontWeight="600" color={Colors.text}>
            Report issue
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* scrollEnabled is false when the sheet is not fully open so any scroll
          gesture is passed up to the sheet, which snaps to index 1 first. */}
      <BottomSheetScrollView
        scrollEnabled={snapIndex >= 2}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {stationDetail && <StationInfoCard station={stationDetail} />}
        {stationDetail && (
          <PlatformAccessCard
            key={station}
            platforms={stationDetail.platforms}
            reports={stationReports}
          />
        )}
        <StationAlertBanner alerts={alerts} />
        <ReportsStatus loading={loading} reports={reports} />
        {stationDetail && <StationAdditionalInfoCard station={stationDetail} />}
      </BottomSheetScrollView>
    </BottomSheet>
  )
}
