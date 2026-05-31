import { useEffect, useState } from 'react'
import { FlatList, Keyboard } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Separator, YStack } from 'tamagui'
import ScreenHeader from '../components/ScreenHeader'
import StationListItem from '../components/StationListItem'
import { STATIONS } from '../constants/stations'
import { stationPicker } from '../navigation/stationPicker'
import type { SelectStationScreenProps, Station } from '../navigation/types'

export default function SelectStationScreen({ navigation, route }: SelectStationScreenProps) {
  const { currentStation } = route.params
  const [query, setQuery] = useState('')
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height))
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const filtered = STATIONS.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase())
  )

  function select(station: Station) {
    stationPicker.resolve(station)
    navigation.goBack()
  }

  return (
    <YStack flex={1} style={{ backgroundColor: 'white' }}>
      <ScreenHeader title="Select station" height={72} onBack={() => navigation.goBack()} />

      <FlatList
        data={filtered}
        keyExtractor={item => item.name}
        ItemSeparatorComponent={() => (
          <Separator style={{ marginLeft: 58 }} borderColor="$borderColor" />
        )}
        renderItem={({ item }) => (
          <StationListItem
            name={item.name}
            lines={item.lines}
            selected={item.name === currentStation}
            onPress={() => select(item.name as Station)}
          />
        )}
      />

      <YStack px="$4" pt="$2.5" style={{ borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingBottom: keyboardHeight > 0 ? 10 : (insets.bottom || 10), marginBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0 }}>
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="search stations..."
          placeholderTextColor="$gray9"
          autoCorrect={false}
          size="$4"
          style={{ borderWidth: 0, backgroundColor: 'transparent', color: '#111827' }}
        />
      </YStack>
    </YStack>
  )
}
