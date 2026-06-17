import * as ImagePicker from 'expo-image-picker'
import { MaterialIcons } from '@expo/vector-icons'
import { Alert, Image } from 'react-native'
import { Text, YStack } from 'tamagui'
import { FormSection } from '@/features/reporting/components/FormSection'
import { useTheme, Borders, Opacity } from '@/theme'

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
  const { Colors, Radii } = useTheme()
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
        gap="$1.5"
        pressStyle={{ opacity: Opacity.pressed }}
        onPress={pick}
        style={{
          borderWidth: Borders.thin,
          borderColor: Colors.border,
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
          <>
            <MaterialIcons name="camera-alt" size={26} color={Colors.secondaryText} />
            <Text fontSize={13} color={Colors.secondaryText}>
              Tap to add a photo
            </Text>
          </>
        )}
      </YStack>
    </FormSection>
  )
}
