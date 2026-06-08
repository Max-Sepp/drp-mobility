import * as Location from 'expo-location'
import { useEffect, useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { ScrollView } from 'tamagui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DEFAULT_STATION, stationPicker, useStations } from '@/features/stations'
import { useOutages } from '@/features/outages'
import { resolveToPostcode, type ResolvedLocation } from '@/features/journey/api/geocode'
import { apiClient } from '@/api/client'
import { useAppLocation } from '@/lib/LocationContext'
import type { Station, StationScreenProps } from '@/navigation/types'
import { useTheme, Heights, Spacing } from '@/theme'
import { PlatformAccessCard } from '@/features/home/components/PlatformAccessCard'
import { QuickReportGrid, type QuickReportAction } from '@/features/home/components/QuickReportGrid'
import { ReportsStatus } from '@/features/home/components/ReportsStatus'
import { StationHeader } from '@/features/home/components/StationHeader'

export const StationScreen = ({ navigation, route }: StationScreenProps) => {
  const { Colors, Radii } = useTheme()
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
      }),
    [Colors, Radii],
  )
  const [station, setStation] = useState<Station>(route.params?.station ?? DEFAULT_STATION)
  const [goingHere, setGoingHere] = useState(false)
  const { stations } = useStations()
  const stationDetail = useMemo(() => stations.find((s) => s.name === station), [stations, station])
  const insets = useSafeAreaInsets()
  const cachedCoords = useAppLocation()
  const [hasLifts, setHasLifts] = useState<boolean | undefined>(undefined)
  const [hasEscalators, setHasEscalators] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!stationDetail) return
    setHasLifts(undefined)
    setHasEscalators(undefined)
    apiClient
      .GET('/equipment', { params: { query: { station_id: stationDetail.id } } })
      .then(({ data }) => {
        if (!data) return
        setHasLifts(data.some((e) => e.equipment_type.name === 'lift'))
        setHasEscalators(data.some((e) => e.equipment_type.name === 'escalator'))
      })
  }, [stationDetail?.id])

  // Live feed of outage reports, filtered to this station. Updates in real time as reports are
  // created, resolved or deleted — no manual refetch on focus.
  const { reports: allReports, loading } = useOutages()
  const reports = useMemo(
    () => allReports.filter((r) => r.failure.equipment.station.name === station),
    [allReports, station],
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
      const toResult = await resolveToPostcode(station)
      if ('error' in toResult) {
        Alert.alert(
          'Station error',
          `Couldn't find a postcode for ${station}. Try planning manually.`,
        )
        return
      }
      const to: ResolvedLocation = { postcode: toResult.postcode, label: station }

      // Attempt to resolve current location for "from", but don't block
      // navigation if unavailable — the journey planner handles an empty from.
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
        <QuickReportGrid onSelect={quickReport} hasLifts={hasLifts} hasEscalators={hasEscalators} />
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

