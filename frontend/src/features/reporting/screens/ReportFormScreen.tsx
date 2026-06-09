import * as ImagePicker from 'expo-image-picker'
import { useEffect, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { TextArea } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { ReportFormScreenProps, Station } from '@/navigation/types'
import { loadActiveJourney, type ActiveJourney } from '@/features/journey/api/activeJourney'
import {
  isEquipmentOnJourney,
  journeyPlatformsAtStation,
} from '@/features/journey/api/journeyLifts'
import { useStations } from '@/features/stations'
import { EquipmentPicker } from '@/features/reporting/components/EquipmentPicker'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { FormSection } from '@/features/reporting/components/FormSection'
import { PhotoPicker } from '@/features/reporting/components/PhotoPicker'
import { SubmitBar } from '@/features/reporting/components/SubmitBar'
import { useTheme, Typography } from '@/theme'

type Equipment = components['schemas']['EquipmentSummary']

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export const ReportFormScreen = ({ navigation, route }: ReportFormScreenProps) => {
  const { Colors } = useTheme()
  const [equipmentType] = useState(route.params.equipmentType)
  const [station] = useState<Station>(route.params.station)
  // Connections come from the equipment rows the backend has for this station and equipment type.
  // Each option carries the equipment_id the report is submitted against.
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [equipmentId, setEquipmentId] = useState<number | null>(null)
  const [loadingEquipment, setLoadingEquipment] = useState(true)
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The in-progress journey (if any), used to surface the equipment on the rider's current route
  // first. Null when no journey is underway — the list then keeps its plain alphabetical order.
  const [activeJourney, setActiveJourney] = useState<ActiveJourney | null>(null)
  const { stations } = useStations()

  const title = equipmentType === 'lift' ? 'Report a broken lift' : 'Report a broken escalator'
  const which = equipmentType === 'lift' ? 'Which lift?' : 'Which escalator?'

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await apiClient.GET('/equipment')
      if (!active) return
      if (data) {
        setEquipment(
          data
            .filter((e) => e.station.name === station && e.equipment_type.name === equipmentType)
            .sort((a, b) => a.connection.localeCompare(b.connection, undefined, { numeric: true })),
        )
      }
      setLoadingEquipment(false)
    })()
    return () => {
      active = false
    }
  }, [station, equipmentType])

  useEffect(() => {
    let active = true
    loadActiveJourney().then((journey) => {
      if (active) setActiveJourney(journey)
    })
    return () => {
      active = false
    }
  }, [])

  // Ids of the equipment that connect to a platform on the line the rider is using at this station,
  // for the current journey. Empty unless a journey is underway and passes through here.
  const highlightedIds = useMemo(() => {
    const stationDetail = stations.find((s) => s.name === station)
    if (!activeJourney || !stationDetail) return new Set<number>()
    const platforms = journeyPlatformsAtStation(
      activeJourney.journey,
      station,
      stationDetail.platforms,
    )
    if (platforms.size === 0) return new Set<number>()
    return new Set(
      equipment.filter((e) => isEquipmentOnJourney(e.connection, platforms)).map((e) => e.id),
    )
  }, [activeJourney, stations, station, equipment])

  // Surface the on-route equipment first while preserving the alphabetical order within each group
  // (Array.prototype.sort is stable). No reordering when nothing is highlighted.
  const orderedEquipment = useMemo(() => {
    if (highlightedIds.size === 0) return equipment
    return [...equipment].sort(
      (a, b) => Number(highlightedIds.has(b.id)) - Number(highlightedIds.has(a.id)),
    )
  }, [equipment, highlightedIds])

  async function submit() {
    if (!equipmentId) {
      Alert.alert('Required', `Please select which ${equipmentType} is broken.`)
      return
    }
    if (photo) {
      const mimeType = photo.mimeType || ''
      if (!ALLOWED_MIME.has(mimeType)) {
        Alert.alert(
          'Unsupported image format',
          `Please choose a JPEG, PNG, WebP, or GIF image. (Detected: ${mimeType || 'unknown'})`,
        )
        return
      }
    }
    setSubmitting(true)
    try {
      const { data, error } = await apiClient.POST('/outage-reports', {
        body: {
          equipment_id: equipmentId,
          breakdown_time: new Date().toISOString(),
          description: description.trim() || null,
        },
      })
      if (error || !data) {
        Alert.alert('Error', 'Failed to submit report. Please try again.')
        setSubmitting(false)
        return
      }
      if (photo) {
        const mimeType = photo.mimeType!
        const formData = new FormData()
        formData.append('file', {
          uri: photo.uri,
          type: mimeType,
          name: mimeType === 'image/png' ? 'photo.png' : 'photo.jpg',
        } as any)
        const { error: imgError } = await apiClient.POST('/outage-reports/{report_id}/image', {
          params: { path: { report_id: data.id } },
          body: formData as any,
        })
        if (imgError) throw new Error(`Image upload failed: ${JSON.stringify(imgError)}`)
      }
      navigation.replace('Success', { station })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      Alert.alert('Error', msg)
      setSubmitting(false)
    }
  }

  return (
    <FormScreenLayout
      header={<ScreenHeader title={title} subtitle={station} onBack={() => navigation.goBack()} />}
      footer={<SubmitBar onPress={submit} submitting={submitting} />}
    >
      <EquipmentPicker
        label={which}
        loading={loadingEquipment}
        equipment={orderedEquipment}
        selectedId={equipmentId}
        onSelect={setEquipmentId}
        emptyText={`No ${equipmentType}s registered at ${station}.`}
        highlightedIds={highlightedIds}
      />

      <PhotoPicker photo={photo} onPicked={setPhoto} />

      <FormSection label="Further comments (optional)">
        <TextArea
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. doors won't open..."
          placeholderTextColor="$gray9"
          numberOfLines={3}
          textAlignVertical="top"
          style={{
            minHeight: 80,
            borderColor: Colors.border,
            backgroundColor: Colors.searchBg,
            color: Colors.text,
            fontSize: Typography.body.fontSize,
          }}
        />
      </FormSection>
    </FormScreenLayout>
  )
}
