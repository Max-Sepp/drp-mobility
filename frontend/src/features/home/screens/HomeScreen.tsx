import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { DEFAULT_STATION, stationPicker, useStations } from '@/features/stations'
import type { Station, StationScreenProps } from '@/navigation/types'
import { PlatformAccessCard } from '../components/PlatformAccessCard'
import { QuickReportGrid, type QuickReportAction } from '../components/QuickReportGrid'
import { ReportsStatus } from '../components/ReportsStatus'
import { StationHeader } from '../components/StationHeader'

type OutageReport = components['schemas']['OutageReportSummary']

export const HomeScreen = ({ navigation, route }: StationScreenProps) => {
  const [station, setStation] = useState<Station>(route.params?.station ?? DEFAULT_STATION)
  const [reports, setReports] = useState<OutageReport[]>([])
  const [loading, setLoading] = useState(false)
  const { stations } = useStations()
  const stationDetail = useMemo(() => stations.find((s) => s.name === station), [stations, station])

  const fetchReports = useCallback(async () => {
    setLoading(true)
    const { data } = await apiClient.GET('/outage-reports')
    if (data) setReports(data.filter((r) => r.failure.equipment.station.name === station))
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
    <ScrollView
      flex={1}
      style={{ backgroundColor: '#f9fafb' }}
      contentContainerStyle={{ paddingBottom: 40 } as any}
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
  )
}
