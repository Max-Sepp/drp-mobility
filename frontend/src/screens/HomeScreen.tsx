import { MaterialIcons } from '@expo/vector-icons'
import { useCallback, useEffect, useState } from 'react'
import { Image, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScrollView, Spinner, Text, XStack, YStack } from 'tamagui'
import { apiClient, BASE_URL } from '../api/client'
import type { components } from '../api/schema.d'
import { DEFAULT_STATION } from '../constants/stations'
import { stationPicker } from '../navigation/stationPicker'
import type { HomeScreenProps, Station } from '../navigation/types'

type OutageReport = components['schemas']['OutageReportSummary']

function parseUtc(iso: string): Date {
  // Append Z if no timezone designator so it's always parsed as UTC
  const hasTimezoneDesignator = /(?:[zZ]|[+-]\d{2}:\d{2})$/.test(iso)
  const normalized = hasTimezoneDesignator ? iso : iso + 'Z'
  return new Date(normalized)
}

function formatTime(iso: string) {
  const d = parseUtc(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function isToday(iso: string) {
  const d = parseUtc(iso)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

function alertLabel(report: OutageReport) {
  const equipment = report.failure.equipment
  const conn = equipment.connection.toUpperCase()
  const type = equipment.equipment_type.name === 'lift' ? 'LIFT' : 'ESCALATOR'
  return `${type} BROKEN – ${conn}`
}

const GRID_ITEMS = [
  { label: 'Lift\nBroken', icon: 'elevator' as const, route: 'ReportForm' as const, equipmentType: 'lift' as const },
  { label: 'Escalator\nBroken', icon: 'escalator' as const, route: 'ReportForm' as const, equipmentType: 'escalator' as const },
  { label: 'Overcrowding', icon: 'groups' as const, disabled: true },
  { label: 'Custom\nIssue', icon: 'edit-note' as const, route: 'ReportCustom' as const },
] as const

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const [station, setStation] = useState<Station>(DEFAULT_STATION)
  const [reports, setReports] = useState<OutageReport[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
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


  function gridPress(item: typeof GRID_ITEMS[number]) {
    if ('disabled' in item) return
    if (item.route === 'ReportForm') {
      navigation.navigate('ReportForm', { equipmentType: item.equipmentType, station })
    } else {
      navigation.navigate('ReportCustom', { station })
    }
  }

  return (
    <ScrollView flex={1} style={{ backgroundColor: '#f9fafb' }} contentContainerStyle={{ paddingBottom: 40 } as any}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#dbeafe' }}>
        <Pressable
          onPress={() => {
            stationPicker.register(setStation)
            navigation.navigate('SelectStation', { currentStation: station })
          }}
        >
          <YStack px="$5" py="$3">
            <XStack items="center" gap="$2">
              <Text fontSize={26} fontWeight="700" color="#1e3a5f">{station}</Text>
              <Text fontSize={20} color="#1e3a5f" style={{ marginTop: 4 }}>▾</Text>
            </XStack>
            <Text fontSize={12} color="#4a6fa5" mt="$1">tap to change station</Text>
          </YStack>
        </Pressable>
      </SafeAreaView>

      {/* Status */}
      {loading ? (
        <YStack mx="$4" mt="$4" p="$5" items="center" style={{ backgroundColor: '#f3f4f6', borderRadius: 10 }}>
          <Spinner color="#9ca3af" />
        </YStack>
      ) : reports.length === 0 ? (
        <YStack mx="$4" mt="$4" p="$5" items="center" gap="$3" style={{ backgroundColor: '#d8f3dc', borderRadius: 10 }}>
          <YStack style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#2d6a4f', alignItems: 'center', justifyContent: 'center' }}>
            <Text color="white" fontSize={24} fontWeight="700">✓</Text>
          </YStack>
          <Text fontSize={18} fontWeight="700" color="#1a3c2a">No known issues</Text>
        </YStack>
      ) : (
        <YStack mx="$4" mt="$4" gap="$2">
          {reports.map(r => {
            const expanded = expandedId === r.id
            const hasPhoto = !!r.image_content_type
            const header = (
              <XStack p="$4" items="center" gap="$3">
                <YStack style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#b91c1c', alignItems: 'center', justifyContent: 'center' }}>
                  <Text color="white" fontWeight="700" fontSize={18}>!</Text>
                </YStack>
                <YStack flex={1}>
                  <Text fontSize={14} fontWeight="700" color="#7f1d1d">{alertLabel(r)}</Text>
                  <Text fontSize={12} color="#991b1b" mt="$1">
                    reported at {formatTime(r.breakdown_time)}{isToday(r.breakdown_time) ? ' today' : ''}
                  </Text>
                </YStack>
                {hasPhoto && <Text fontSize={12} color="#991b1b">{expanded ? '▲' : '▼'}</Text>}
              </XStack>
            )
            return hasPhoto ? (
              <Pressable key={r.id} onPress={() => setExpandedId(expanded ? null : r.id)}>
                <YStack style={{ backgroundColor: '#fee2e2', borderRadius: 10 }}>
                  {header}
                  {expanded && (
                    <YStack px="$4" pb="$4" gap="$3">
                      {r.description ? (
                        <Text fontSize={13} color="#7f1d1d">{r.description}</Text>
                      ) : null}
                      <Image
                        source={{ uri: `${BASE_URL}/outage-reports/${r.id}/image` }}
                        style={{ width: '100%', height: 180, borderRadius: 8 }}
                        resizeMode="cover"
                      />
                    </YStack>
                  )}
                </YStack>
              </Pressable>
            ) : (
              <YStack key={r.id} style={{ backgroundColor: '#fee2e2', borderRadius: 10 }}>
                {header}
                {r.description ? (
                  <YStack px="$4" pb="$4">
                    <Text fontSize={13} color="#7f1d1d">{r.description}</Text>
                  </YStack>
                ) : null}
              </YStack>
            )
          })}
        </YStack>
      )}

      {/* Quick report grid */}
      <Text fontSize={13} fontWeight="600" color="#374151" mt="$4" mb="$2" mx="$4">Quick report</Text>
      <XStack flexWrap="wrap" mx="$4" gap="$2.5" justify="center">
        {GRID_ITEMS.map(item => {
          const disabled = 'disabled' in item
          return (
            <YStack
              key={item.label}
              width="47%"
              opacity={disabled ? 0.4 : 1}
              pressStyle={disabled ? undefined : { opacity: 0.7 }}
              onPress={disabled ? undefined : () => gridPress(item)}
              style={{ aspectRatio: 1.3, borderWidth: 1.5, borderColor: '#d1d5db', borderRadius: 10, backgroundColor: 'white' }}
            >
              <YStack flex={1} items="center" justify="center" gap="$1.5">
                <MaterialIcons name={item.icon} size={40} color={disabled ? '#9ca3af' : '#111827'} />
                <Text
                  fontSize={15}
                  fontWeight="600"
                  color="#111827"
                  lineHeight={20}
                  style={{ textAlign: 'center' }}
                >
                  {item.label}
                </Text>
              </YStack>
            </YStack>
          )
        })}
      </XStack>
    </ScrollView>
  )
}
