import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { TextArea } from 'tamagui'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { ReportFormScreenProps, Station } from '@/navigation/types'
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
        equipment={equipment}
        selectedId={equipmentId}
        onSelect={setEquipmentId}
        emptyText={`No ${equipmentType}s registered at ${station}.`}
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
