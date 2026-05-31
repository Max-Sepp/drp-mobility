import { Ionicons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { useEffect, useState } from 'react'
import { Alert, Image, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ScrollView, Spinner, TextArea, Text, XStack, YStack } from 'tamagui'
import { apiClient } from '../api/client'
import type { components } from '../api/schema.d'
import type { ReportFormScreenProps, Station } from '../navigation/types'

type Equipment = components['schemas']['EquipmentSummary']

export default function ReportFormScreen({ navigation, route }: ReportFormScreenProps) {
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
          data.filter(e => e.station.name === station && e.equipment_type.name === equipmentType),
        )
      }
      setLoadingEquipment(false)
    })()
    return () => {
      active = false
    }
  }, [station, equipmentType])

  async function pickPhoto() {
    Alert.alert('Attach photo', undefined, [
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Camera access is needed to take a photo.')
            return
          }
          const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
          if (!result.canceled) setPhoto(result.assets[0])
        },
      },
      {
        text: 'Choose from library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })
          if (!result.canceled) setPhoto(result.assets[0])
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

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
      navigation.replace('Success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      Alert.alert('Error', msg)
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'white' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView flex={1} style={{ backgroundColor: 'white' }} contentContainerStyle={{ paddingBottom: 16 } as any} keyboardShouldPersistTaps="handled">
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#dbeafe' }}>
        <YStack style={{ height: 96, justifyContent: 'center', paddingBottom: 8 }} px="$5" gap="$1">
          <XStack items="center" gap="$1" mb="$2" style={{ alignSelf: 'flex-start' }} pressStyle={{ opacity: 0.6 }} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={18} color="#2563eb" />
            <Text fontSize={14} fontWeight="500" color="#2563eb">Back</Text>
          </XStack>
          <Text fontSize={22} fontWeight="700" color="#1a1a1a">{title}</Text>
          <Text fontSize={16} color="#4a6fa5" mt="$1">{station}</Text>
        </YStack>
      </SafeAreaView>

      {/* Connection picker */}
      <YStack px="$5" mt="$5">
        <Text fontSize={14} fontWeight="600" color="#6b7280" mb="$2">{which}</Text>
        {loadingEquipment ? (
          <Spinner color="#9ca3af" />
        ) : equipment.length === 0 ? (
          <Text fontSize={15} color="#9ca3af">No {equipmentType}s registered at {station}.</Text>
        ) : (
          equipment.map(e => {
            const selected = equipmentId === e.id
            return (
              <XStack
                key={e.id}
                items="center"
                gap="$3"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => setEquipmentId(e.id)}
                mb="$2"
                style={{
                  paddingVertical: 12, paddingHorizontal: 14,
                  borderWidth: 1, borderColor: selected ? '#2d6a4f' : '#e5e7eb',
                  borderRadius: 8, backgroundColor: selected ? '#f0fdf4' : 'white',
                }}
              >
                <YStack
                  style={{
                    width: 22, height: 22, borderRadius: 4, borderWidth: 2,
                    borderColor: selected ? '#2d6a4f' : '#9ca3af',
                    backgroundColor: selected ? '#2d6a4f' : 'transparent',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {selected && <Text color="white" fontSize={12} fontWeight="700">✕</Text>}
                </YStack>
                <Text fontSize={15} color="#111827">{e.connection}</Text>
              </XStack>
            )
          })
        )}
      </YStack>

      {/* Photo */}
      <YStack px="$5" mt="$5">
        <Text fontSize={14} fontWeight="600" color="#6b7280" mb="$2">Attach photo (optional)</Text>
        <YStack
          items="center"
          justify="center"
          pressStyle={{ opacity: 0.7 }}
          onPress={pickPhoto}
          style={{ borderWidth: 2, borderColor: '#9ca3af', borderStyle: 'dashed', borderRadius: 8, height: 100, overflow: 'hidden' }}
        >
          {photo ? (
            <Image source={{ uri: photo.uri }} style={{ width: '100%', height: '100%', resizeMode: 'cover' }} />
          ) : (
            <Text fontSize={14} color="#9ca3af">[ + ]  tap to upload image</Text>
          )}
        </YStack>
      </YStack>

      {/* Description */}
      <YStack px="$5" mt="$5">
        <Text fontSize={14} fontWeight="600" color="#6b7280" mb="$2">Further comments (optional)</Text>
        <TextArea
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. doors won't open..."
          placeholderTextColor="$gray9"
          numberOfLines={3}
          textAlignVertical="top"
          style={{ minHeight: 80, borderColor: '#d1d5db', backgroundColor: '#f9fafb', color: '#111827', fontSize: 15 }}
        />
      </YStack>

    </ScrollView>
    <SafeAreaView edges={['bottom']} style={{ backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#e5e7eb' }}>
      <YStack
        mx="$5"
        my="$3"
        items="center"
        justify="center"
        pressStyle={{ opacity: 0.8 }}
        onPress={submitting ? undefined : submit}
        opacity={submitting ? 0.6 : 1}
        style={{ backgroundColor: '#111827', borderRadius: 10, height: 52 }}
      >
        {submitting ? (
          <Spinner color="white" />
        ) : (
          <Text color="white" fontSize={16} fontWeight="700">Submit</Text>
        )}
      </YStack>
    </SafeAreaView>
    </KeyboardAvoidingView>
  )
}
