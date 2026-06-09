import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { Input, TextArea } from 'tamagui'
import { apiClient } from '@/api/client'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { ReportCustomScreenProps } from '@/navigation/types'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { FormSection } from '@/features/reporting/components/FormSection'
import { PhotoPicker } from '@/features/reporting/components/PhotoPicker'
import { SubmitBar } from '@/features/reporting/components/SubmitBar'
import { useTheme, Typography } from '@/theme'

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export const ReportCustomScreen = ({ navigation, route }: ReportCustomScreenProps) => {
  const { Colors } = useTheme()
  const { station } = route.params
  const [description, setDescription] = useState('')
  const [area, setArea] = useState('')
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null)
  const [equipmentId, setEquipmentId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    apiClient.GET('/equipment').then(({ data }) => {
      if (!active || !data) return
      const equip = data.find(
        (e) => e.station.name === station && e.equipment_type.name === 'custom',
      )
      if (equip) setEquipmentId(equip.id)
    })
    return () => {
      active = false
    }
  }, [station])

  async function submit() {
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe the issue.')
      return
    }
    if (!equipmentId) {
      Alert.alert('Error', 'Could not find station equipment. Please try again.')
      return
    }
    if (photo) {
      const mimeType = photo.mimeType ?? ''
      if (!ALLOWED_MIME.has(mimeType)) {
        Alert.alert(
          'Unsupported image',
          `Please choose a JPEG, PNG, WebP, or GIF. (Detected: ${mimeType || 'unknown'})`,
        )
        return
      }
    }

    setSubmitting(true)
    try {
      const descParts = [description.trim(), area.trim() ? `Area: ${area.trim()}` : ''].filter(
        Boolean,
      )
      const { data, error } = await apiClient.POST('/outage-reports', {
        body: {
          equipment_id: equipmentId,
          breakdown_time: new Date().toISOString(),
          description: descParts.join('\n'),
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
        } as unknown as Blob)
        await apiClient.POST('/outage-reports/{report_id}/image', {
          params: { path: { report_id: data.id } },
          body: formData as unknown as never,
        })
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
      header={
        <ScreenHeader
          title="Describe the issue"
          subtitle={station}
          onBack={() => navigation.goBack()}
        />
      }
      footer={<SubmitBar onPress={submit} submitting={submitting} />}
    >
      <FormSection label="Issue description">
        <TextArea
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. fallen light blocking path to escalator"
          placeholderTextColor="$gray9"
          numberOfLines={4}
          textAlignVertical="top"
          style={{
            minHeight: 100,
            borderColor: Colors.border,
            backgroundColor: Colors.searchBg,
            color: Colors.text,
            fontSize: Typography.body.fontSize,
          }}
        />
      </FormSection>

      <FormSection label="Area within station (optional)">
        <Input
          value={area}
          onChangeText={setArea}
          placeholder="e.g. northbound platform, main entrance…"
          placeholderTextColor="$gray9"
          style={{
            borderColor: Colors.border,
            backgroundColor: Colors.searchBg,
            color: Colors.text,
            fontSize: Typography.body.fontSize,
          }}
        />
      </FormSection>

      <PhotoPicker photo={photo} onPicked={setPhoto} />
    </FormScreenLayout>
  )
}
