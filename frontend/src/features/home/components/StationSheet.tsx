// Bottom sheet showing station detail — platform access and live outage reports.
// Always mounted in MapHomeScreen; opens when `station` prop is set, closes when null.
// Reporting opens ReportSheet (sibling in MapHomeScreen). JourneyPlanner navigates on the stack.

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { PlatformAccessCard } from '@/features/home/components/PlatformAccessCard'
import { ReportsStatus } from '@/features/home/components/ReportsStatus'
import { StationAdditionalInfoCard } from '@/features/home/components/StationAdditionalInfoCard'
import { StationInfoCard } from '@/features/home/components/StationInfoCard'
import { useOutages } from '@/features/outages'
import { overallSeverity } from '@/features/outages/severity'
import { StepFreeBadge, useStations } from '@/features/stations'
import { resolveToPostcode, type ResolvedLocation } from '@/features/journey/api/geocode'
import { useAppLocation } from '@/lib/LocationContext'
import type { JourneyPlan } from '@/features/home/components/JourneyPlannerSheet'
import { useTheme, Heights, Spacing } from '@/theme'

const SCREEN_H = Dimensions.get('window').height
const SNAP_POINTS = [SCREEN_H * 0.52, SCREEN_H * 0.82]

type Props = {
  station: string | null
  onClose: () => void
  onReportPress: () => void
  onOpenJourney: (plan: JourneyPlan) => void
}

export function StationSheet({ station, onClose, onReportPress, onOpenJourney }: Props) {
  const { Colors, Radii, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.md,
        },
        closeBtn: {
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: Colors.searchBg,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 2,
        },
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
  const cachedCoords = useAppLocation()
  const [goingHere, setGoingHere] = useState(false)
  const [snapIndex, setSnapIndex] = useState(-1)
  const sheetRef = useRef<BottomSheetRef>(null)

  const { stations } = useStations()
  const stationDetail = useMemo(() => stations.find((s) => s.name === station), [stations, station])

  const { reports: allReports, loading } = useOutages()
  const reports = useMemo(
    () => allReports.filter((r) => r.failure.equipment.station.name === station),
    [allReports, station],
  )
  const badgeSeverity = useMemo(() => overallSeverity(reports), [reports])

  // Imperatively open or close the sheet when the station prop changes.
  // The index prop alone is unreliable for re-triggering gorhom after mount.
  useEffect(() => {
    if (station) {
      sheetRef.current?.snapToIndex(0)
    } else {
      sheetRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGoingHere(false)
  }, [station])

  // Track snap index so we can disable the inner scroll until the sheet is fully open.
  // onChange(-1) is also the single place we notify the parent the sheet is gone.
  function handleChange(index: number) {
    setSnapIndex(index)
    if (index === -1) onClose()
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
      const to: ResolvedLocation = { postcode: toResult.postcode, label: station }

      let from: ResolvedLocation | undefined
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status === 'granted') {
        const pos =
          cachedCoords ??
          (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })).coords
        const fromResult = await resolveToPostcode(`${pos.latitude},${pos.longitude}`)
        if (!('error' in fromResult)) {
          from = { postcode: fromResult.postcode, label: 'Current location' }
        }
      }

      onOpenJourney({ initialFrom: from, initialTo: to })
    } finally {
      setGoingHere(false)
    }
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={SNAP_POINTS}
      enablePanDownToClose
      onChange={handleChange}
    >
      {/* Header: station name + close button */}
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text fontSize={20} fontWeight="700" color={Colors.text} numberOfLines={1}>
            {station ?? ''}
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            {stationDetail?.step_free && <StepFreeBadge value={stationDetail.step_free} />}
            {reports.length > 0 && (
              <XStack
                items="center"
                gap="$1.5"
                px="$2"
                py="$1"
                style={{
                  backgroundColor: badgeSeverity === 'warning' ? Colors.warningBg : Colors.dangerBg,
                  borderRadius: 6,
                }}
              >
                <MaterialIcons
                  name="warning"
                  size={16}
                  color={badgeSeverity === 'warning' ? Colors.warningDark : Colors.dangerDark}
                />
                <Text
                  fontSize={13}
                  fontWeight="600"
                  color={badgeSeverity === 'warning' ? Colors.warningDark : Colors.dangerDark}
                >
                  Issues reported
                </Text>
              </XStack>
            )}
          </XStack>
        </View>
        <TouchableOpacity
          onPress={() => sheetRef.current?.close()}
          style={styles.closeBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Close station info"
        >
          <MaterialIcons name="close" size={18} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

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
        scrollEnabled={snapIndex >= 1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
      >
        {stationDetail && <StationInfoCard station={stationDetail} />}
        {stationDetail && <PlatformAccessCard key={station} platforms={stationDetail.platforms} />}
        <ReportsStatus loading={loading} reports={reports} />
        {stationDetail && <StationAdditionalInfoCard station={stationDetail} />}
      </BottomSheetScrollView>
    </BottomSheet>
  )
}
