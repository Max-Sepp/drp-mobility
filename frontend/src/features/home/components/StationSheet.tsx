// Bottom sheet showing station detail — platform access, live outage reports, and quick-report buttons.
// Always mounted in MapHomeScreen; opens when `station` prop is set, closes when null.
// The reporting / journey-planner flows still navigate onto the stack (full-screen forms).

import { MaterialIcons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Dimensions, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import BottomSheet, { BottomSheetScrollView, type BottomSheetRef } from '@/components/BottomSheet'
import { PlatformAccessCard } from '@/features/home/components/PlatformAccessCard'
import { QuickReportGrid, type QuickReportAction } from '@/features/home/components/QuickReportGrid'
import { ReportsStatus } from '@/features/home/components/ReportsStatus'
import { useOutages } from '@/features/outages'
import { useStations } from '@/features/stations'
import { resolveToPostcode, type ResolvedLocation } from '@/features/journey/api/geocode'
import { useAppLocation } from '@/lib/LocationContext'
import type { RootStackParamList } from '@/navigation/types'
import { Colors, Heights, Radii, Shadows, Spacing } from '@/theme'

const SCREEN_H = Dimensions.get('window').height
const SNAP_POINTS = [SCREEN_H * 0.52, SCREEN_H * 0.82]

type Props = {
  station: string | null
  onClose: () => void
}

export function StationSheet({ station, onClose }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const insets = useSafeAreaInsets()
  const cachedCoords = useAppLocation()
  const [goingHere, setGoingHere] = useState(false)
  const [snapIndex, setSnapIndex] = useState(-1)
  const sheetRef = useRef<BottomSheetRef>(null)

  const { stations } = useStations()
  const stationDetail = useMemo(
    () => stations.find((s) => s.name === station),
    [stations, station],
  )

  const { reports: allReports, loading } = useOutages()
  const reports = useMemo(
    () => allReports.filter((r) => r.failure.equipment.station.name === station),
    [allReports, station],
  )

  // Imperatively open or close the sheet when the station prop changes.
  // The index prop alone is unreliable for re-triggering gorhom after mount.
  useEffect(() => {
    if (station) {
      sheetRef.current?.snapToIndex(0)
    } else {
      sheetRef.current?.close()
    }
    setGoingHere(false)
  }, [station])

  // Track snap index so we can disable the inner scroll until the sheet is fully open.
  // onChange(-1) is also the single place we notify the parent the sheet is gone.
  function handleChange(index: number) {
    setSnapIndex(index)
    if (index === -1) onClose()
  }

  function handleQuickReport(action: QuickReportAction) {
    if (!station) return
    if (action.route === 'ReportForm') {
      navigation.navigate('ReportForm', { equipmentType: action.equipmentType, station })
    } else {
      navigation.navigate('ReportCustom', { station })
    }
  }

  async function handleGoHere() {
    if (!station) return
    setGoingHere(true)
    try {
      const toResult = await resolveToPostcode(station)
      if ('error' in toResult) {
        Alert.alert('Station error', `Couldn't find a postcode for ${station}. Try planning manually.`)
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

      navigation.navigate('JourneyPlanner', { initialFrom: from, initialTo: to })
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
        <View style={{ flex: 1 }}>
          <Text fontSize={20} fontWeight="700" color={Colors.text} numberOfLines={1}>
            {station ?? ''}
          </Text>
          <Text fontSize={13} color={Colors.secondaryText} mt="$1">
            Underground station
          </Text>
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
          <MaterialIcons name="directions" size={18} color={Colors.card} style={{ marginRight: 6 }} />
          <Text fontSize={14} fontWeight="600" color={Colors.card}>
            {goingHere ? 'Getting location…' : 'Directions'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline]}
          activeOpacity={0.8}
          onPress={() => station && navigation.navigate('ReportCustom', { station })}
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
        {stationDetail && (
          <PlatformAccessCard key={station} platforms={stationDetail.platforms} />
        )}

        <ReportsStatus loading={loading} reports={reports} />

        <QuickReportGrid onSelect={handleQuickReport} />
      </BottomSheetScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
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
})
