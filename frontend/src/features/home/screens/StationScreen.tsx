import { MaterialIcons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ScrollView } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DEFAULT_STATION, stationPicker, useStations } from '@/features/stations'
import { useOutages } from '@/features/outages'
import { resolveToPostcode, type ResolvedLocation } from '@/features/journey/api/geocode'
import { useAppLocation } from '@/lib/LocationContext'
import type { Station, StationScreenProps } from '@/navigation/types'
import { useTheme, Heights, Spacing } from '@/theme'
import { PlatformAccessCard } from '@/features/home/components/PlatformAccessCard'
import { ReportSheet } from '@/features/home/components/ReportSheet'
import { ReportsStatus } from '@/features/home/components/ReportsStatus'
import { StationHeader } from '@/features/home/components/StationHeader'
import { StationAdditionalInfoCard } from '@/features/home/components/StationAdditionalInfoCard'
import { StationInfoCard } from '@/features/home/components/StationInfoCard'

export const StationScreen = ({ navigation, route }: StationScreenProps) => {
  const { Colors, Radii, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: {
          flex: 1,
          backgroundColor: Colors.background,
        },
        footer: {
          backgroundColor: Colors.card,
          paddingTop: Spacing.md,
          paddingHorizontal: Spacing.lg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: Colors.border,
          flexDirection: 'row',
          gap: Spacing.md,
        },
        btn: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          height: Heights.button,
          borderRadius: Radii.button,
          backgroundColor: Colors.blue,
          ...Shadows.card,
        },
        btnOutline: {
          backgroundColor: Colors.searchBg,
        },
        btnDisabled: {
          backgroundColor: Colors.secondaryText,
        },
      }),
    [Colors, Radii, Shadows],
  )

  const [station, setStation] = useState<Station>(route.params?.station ?? DEFAULT_STATION)
  const [goingHere, setGoingHere] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const { stations } = useStations()
  const stationDetail = useMemo(() => stations.find((s) => s.name === station), [stations, station])
  const insets = useSafeAreaInsets()
  const cachedCoords = useAppLocation()

  const { reports: allReports, loading } = useOutages()
  const reports = useMemo(
    () => allReports.filter((r) => r.failure.equipment.station.name === station),
    [allReports, station],
  )

  function changeStation() {
    stationPicker.register(setStation)
    navigation.navigate('SelectStation', { currentStation: station })
  }

  async function handleDirections() {
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
      if (cachedCoords) {
        const fromResult = await resolveToPostcode(
          `${cachedCoords.latitude},${cachedCoords.longitude}`,
        )
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
        {stationDetail && <StationInfoCard station={stationDetail} />}
        {stationDetail && <PlatformAccessCard key={station} platforms={stationDetail.platforms} />}
        <ReportsStatus loading={loading} reports={reports} />
        {stationDetail && <StationAdditionalInfoCard station={stationDetail} />}
      </ScrollView>

      {/* Sticky footer — Directions + Report issue */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.btn, goingHere && styles.btnDisabled]}
          onPress={goingHere ? undefined : handleDirections}
          activeOpacity={0.8}
        >
          <MaterialIcons
            name="directions"
            size={18}
            color={Colors.card}
            style={{ marginRight: 6 }}
          />
          <Text style={{ color: Colors.card, fontSize: 14, fontWeight: '700' }}>
            {goingHere ? 'Getting location…' : 'Directions'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.btn, styles.btnOutline]}
          onPress={() => setReportOpen(true)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="flag" size={18} color={Colors.text} style={{ marginRight: 6 }} />
          <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '700' }}>Report issue</Text>
        </TouchableOpacity>
      </View>

      <ReportSheet station={reportOpen ? station : null} onClose={() => setReportOpen(false)} />
    </View>
  )
}
