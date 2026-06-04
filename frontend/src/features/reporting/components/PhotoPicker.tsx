import * as ImagePicker from 'expo-image-picker'
import { Alert, Image } from 'react-native'
import { Text, YStack } from 'tamagui'
import { FormSection } from '@/features/reporting/components/FormSection'
import { Borders, Colors, Opacity, Radii } from '@/theme'

type PhotoPickerProps = {
  photo: ImagePicker.ImagePickerAsset | null
  onPicked: (photo: ImagePicker.ImagePickerAsset) => void
  label?: string
}

export const PhotoPicker = ({
  photo,
  onPicked,
  label = 'Attach photo (optional)',
}: PhotoPickerProps) => {
  function pick() {
    Alert.alert('Attach photo', undefined, [
      {
        text: 'Take photo',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permission required', 'Camera access is needed to take a photo.')
            return
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          })
          if (!result.canceled) onPicked(result.assets[0])
        },
      },
      {
        text: 'Choose from library',
        onPress: async () => {
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          })
          if (!result.canceled) onPicked(result.assets[0])
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  return (
    <FormSection label={label}>
      <YStack
        items="center"
        justify="center"
        pressStyle={{ opacity: Opacity.pressed }}
        onPress={pick}
        style={{
          borderWidth: Borders.thick,
          borderColor: Colors.placeholderText,
          borderStyle: 'dashed',
          borderRadius: Radii.small,
          height: 100,
          overflow: 'hidden',
        }}
      >
        {photo ? (
          <Image
            source={{ uri: photo.uri }}
            style={{ width: '100%', height: '100%', resizeMode: 'cover' }}
          />
        ) : (
          <Text fontSize={14} color={Colors.placeholderText}>
            [ + ] tap to upload image
          </Text>
        )}
      </YStack>
    </FormSection>
  )
}
