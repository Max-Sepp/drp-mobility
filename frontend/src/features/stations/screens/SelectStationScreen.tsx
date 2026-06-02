import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Keyboard } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Separator, Text, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { SelectStationScreenProps, Station } from '@/navigation/types'
import { StationListItem } from '../components/StationListItem'
import { stationPicker } from '../stationPicker'
import { stationLines, useStations } from '../useStations'

export const SelectStationScreen = ({ navigation, route }: SelectStationScreenProps) => {
  const { currentStation } = route.params
  const [query, setQuery] = useState('')
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const insets = useSafeAreaInsets()
  const { stations, loading, error } = useStations()

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardHeight(e.endCoordinates.height),
    )
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const filtered = useMemo(
    () => stations.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())),
    [stations, query],
  )

  function select(station: Station) {
    stationPicker.resolve(station)
    navigation.goBack()
  }

  return (
    <YStack flex={1} style={{ backgroundColor: 'white' }}>
      <ScreenHeader title="Select station" height={72} onBack={() => navigation.goBack()} />

      {loading ? (
        <YStack flex={1} items="center" justify="center" gap="$3">
          <ActivityIndicator size="large" color="#2d6a4f" />
          <Text color="#6b7280">Loading stations…</Text>
        </YStack>
      ) : error ? (
        <YStack flex={1} items="center" justify="center" px="$6">
          <Text color="#991b1b" fontSize={15} style={{ textAlign: 'center' }}>
            Couldn’t load stations. Check your connection and try again.
          </Text>
        </YStack>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => (
            <Separator style={{ marginLeft: 58 }} borderColor="$borderColor" />
          )}
          renderItem={({ item }) => (
            <StationListItem
              name={item.name}
              lines={stationLines(item)}
              stepFree={item.step_free}
              selected={item.name === currentStation}
              onPress={() => select(item.name as Station)}
            />
          )}
        />
      )}

      <YStack
        px="$4"
        pt="$2.5"
        style={{
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          paddingBottom: keyboardHeight > 0 ? 10 : insets.bottom || 10,
          marginBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0,
        }}
      >
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
