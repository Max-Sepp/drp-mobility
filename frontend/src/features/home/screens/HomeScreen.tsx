import { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { DEFAULT_STATION, stationPicker } from '@/features/stations'
import type { HomeScreenProps, Station } from '@/navigation/types'
import { QuickReportGrid, type QuickReportAction } from '../components/QuickReportGrid'
import { ReportsStatus } from '../components/ReportsStatus'
import { StationHeader } from '../components/StationHeader'

type OutageReport = components['schemas']['OutageReportSummary']

export const HomeScreen = ({ navigation }: HomeScreenProps) => {
  const [station, setStation] = useState<Station>(DEFAULT_STATION)
  const [reports, setReports] = useState<OutageReport[]>([])
  const [loading, setLoading] = useState(false)

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
      <StationHeader station={station} onPress={changeStation} />
      <ReportsStatus loading={loading} reports={reports} />
      <QuickReportGrid onSelect={quickReport} />
    </ScrollView>
  )
}
