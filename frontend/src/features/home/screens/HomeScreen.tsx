import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, XStack } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { DEFAULT_STATION, stationPicker, useStations } from '@/features/stations'
import type { HomeScreenProps, Station } from '@/navigation/types'
import { PlatformAccessCard } from '../components/PlatformAccessCard'
import { QuickReportGrid, type QuickReportAction } from '../components/QuickReportGrid'
import { ReportsStatus } from '../components/ReportsStatus'
import { StationHeader } from '../components/StationHeader'

type OutageReport = components['schemas']['OutageReportSummary']

export const HomeScreen = ({ navigation }: HomeScreenProps) => {
  const [station, setStation] = useState<Station>(DEFAULT_STATION)
  const [reports, setReports] = useState<OutageReport[]>([])
  const [loading, setLoading] = useState(false)
  const { stations } = useStations()
  const stationDetail = useMemo(() => stations.find(s => s.name === station), [stations, station])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data } = await apiClient.GET('/outage-reports')
    if (data) setReports(data.filter(r => r.failure.equipment.station.name === station))
    setLoading(false)
  }, [station])

  useEffect(() => {
    fetchReports()
    const unsub = navigation.addListener('focus', fetchReports)
    return unsub
  }, [fetchReports, navigation])

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

  return (
    <ScrollView flex={1} style={{ backgroundColor: '#f9fafb' }} contentContainerStyle={{ paddingBottom: 40 } as any}>
      <StationHeader station={station} stepFree={stationDetail?.step_free} onPress={changeStation} />
      {stationDetail && <PlatformAccessCard key={station} platforms={stationDetail.platforms} />}
      <ReportsStatus loading={loading} reports={reports} />
      <XStack
        mx="$4"
        mt="$4"
        items="center"
        gap="$2.5"
        pressStyle={{ opacity: 0.8 }}
        onPress={() => navigation.navigate('JourneyPlanner')}
        style={{ backgroundColor: '#111827', borderRadius: 10, height: 56, paddingHorizontal: 16 }}
      >
        <MaterialIcons name="directions" size={26} color="white" />
        <Text color="white" fontSize={16} fontWeight="700">Plan a journey</Text>
      </XStack>
      <QuickReportGrid onSelect={quickReport} />
    </ScrollView>
  )
}
