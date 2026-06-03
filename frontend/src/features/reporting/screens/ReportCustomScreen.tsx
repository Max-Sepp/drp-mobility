import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { Alert } from 'react-native'
import { Input, TextArea } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { ReportCustomScreenProps } from '@/navigation/types'
import { FormScreenLayout } from '../components/FormScreenLayout'
import { FormSection } from '../components/FormSection'
import { PhotoPicker } from '../components/PhotoPicker'
import { SubmitBar } from '../components/SubmitBar'
import { Colors, Typography } from '@/theme'

export const ReportCustomScreen = ({ navigation, route }: ReportCustomScreenProps) => {
  const { station } = route.params
  const [description, setDescription] = useState('')
  const [area, setArea] = useState('')
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null)

  function submit() {
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe the issue.')
      return
    }
    Alert.alert('Coming soon', 'Custom issue reporting will be available in a future update.')
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
      footer={<SubmitBar onPress={submit} />}
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
          placeholder="-- select --"
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
