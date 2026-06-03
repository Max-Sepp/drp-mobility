import { useFocusEffect } from '@react-navigation/native'
import * as Location from 'expo-location'
import { useCallback, useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ScrollView } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { DEFAULT_STATION, stationPicker, useStations } from '@/features/stations'
import { resolveToPostcode, type ResolvedLocation } from '@/features/journey/api/geocode'
import type { Station, StationScreenProps } from '@/navigation/types'
import { Colors, Heights, Radii, Spacing } from '@/theme'
import { PlatformAccessCard } from '../components/PlatformAccessCard'
import { QuickReportGrid, type QuickReportAction } from '../components/QuickReportGrid'
import { ReportsStatus } from '../components/ReportsStatus'
import { StationHeader } from '../components/StationHeader'

type OutageReport = components['schemas']['OutageReportSummary']

export const StationScreen = ({ navigation, route }: StationScreenProps) => {
  const [station, setStation] = useState<Station>(route.params?.station ?? DEFAULT_STATION)
  const [reports, setReports] = useState<OutageReport[]>([])
  const [loading, setLoading] = useState(false)
  const [goingHere, setGoingHere] = useState(false)
  const { stations } = useStations()
  const stationDetail = useMemo(() => stations.find((s) => s.name === station), [stations, station])
  const insets = useSafeAreaInsets()

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data } = await apiClient.GET('/outage-reports')
    if (data) setReports(data.filter((r) => r.failure.equipment.station.name === station))
    setLoading(false)
  }, [station])

  useFocusEffect(
    useCallback(() => {
      fetchReports()
    }, [fetchReports]),
  )

  function changeStation() {
    stationPicker.register(setStation)
    navigation.navigate('SelectStation', { currentStation: station })
  }

  function quickReport(action: QuickReportAction) {
    if (action.route === 'ReportForm') {
      navigation.navigate('ReportForm', { equipmentType: action.equipmentType, station })
    } else {
      navigation.navigate('ReportCustom', { station })
    }
  }

  async function handleGoHere() {
    setGoingHere(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location required', 'Enable location access in Settings to use this feature.')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const fromResult = await resolveToPostcode(
        `${pos.coords.latitude},${pos.coords.longitude}`,
      )
      if ('error' in fromResult) {
        Alert.alert('Location error', fromResult.error)
        return
      }
      const toResult = await resolveToPostcode(station)
      if ('error' in toResult) {
        Alert.alert('Station error', `Couldn't find a postcode for ${station}. Try planning manually.`)
        return
      }
      const from: ResolvedLocation = { postcode: fromResult.postcode, label: 'Current location' }
      const to: ResolvedLocation = { postcode: toResult.postcode, label: station }
      navigation.navigate('JourneyPlanner', { initialFrom: from, initialTo: to })
    } finally {
      setGoingHere(false)
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        flex={1}
        style={{ backgroundColor: Colors.background }}
        contentContainerStyle={{ paddingBottom: 16 } as any}
      >
        <StationHeader
          station={station}
          stepFree={stationDetail?.step_free}
          onPress={changeStation}
          onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        />
        {stationDetail && <PlatformAccessCard key={station} platforms={stationDetail.platforms} />}
        <ReportsStatus loading={loading} reports={reports} />
        <QuickReportGrid onSelect={quickReport} />
      </ScrollView>

      {/* Sticky "Go here" footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.goHereBtn, goingHere && styles.goHereBtnDisabled]}
          onPress={goingHere ? undefined : handleGoHere}
          activeOpacity={0.85}
        >
          <Text style={styles.goHereText}>
            {goingHere ? 'Getting location…' : `Go to ${station}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  footer: {
    backgroundColor: Colors.card,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  goHereBtn: {
    backgroundColor: Colors.blue,
    borderRadius: Radii.button,
    height: Heights.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goHereBtnDisabled: {
    backgroundColor: Colors.secondaryText,
  },
  goHereText: {
    color: Colors.card,
    fontSize: 16,
    fontWeight: '700',
  },
})
