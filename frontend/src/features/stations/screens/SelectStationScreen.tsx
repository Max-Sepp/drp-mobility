import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Keyboard, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Input, Separator, Text, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import type { SelectStationScreenProps, Station } from '@/navigation/types'
import { useTheme, Borders } from '@/theme'
import { StationListItem } from '@/features/stations/components/StationListItem'
import { stationPicker } from '@/features/stations/stationPicker'
import { fuzzyScore } from '@/lib/fuzzy'
import { stationLines, useStations } from '@/features/stations/useStations'

export const SelectStationScreen = ({ navigation, route }: SelectStationScreenProps) => {
  const { Colors } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        searchBar: {
          borderTopWidth: Borders.thin,
          borderTopColor: Colors.border,
        },
      }),
    [Colors],
  )
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

  const filtered = useMemo(() => {
    if (!query) return stations
    return stations
      .map((s) => ({ station: s, score: fuzzyScore(query, s.name) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ station }) => station)
  }, [stations, query])

  function select(station: Station) {
    stationPicker.resolve(station)
    navigation.goBack()
  }

  return (
    <YStack flex={1} style={{ backgroundColor: Colors.card }}>
      <ScreenHeader title="Select station" height={72} onBack={() => navigation.goBack()} />

      {loading ? (
        <YStack flex={1} items="center" justify="center" gap="$3">
          <ActivityIndicator size="large" color={Colors.blue} />
          <Text color={Colors.secondaryText}>Loading stations…</Text>
        </YStack>
      ) : error ? (
        <YStack flex={1} items="center" justify="center" px="$6">
          <Text color={Colors.dangerDark} fontSize={15} style={{ textAlign: 'center' }}>
            Couldn&apos;t load stations. Check your connection and try again.
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
        style={[
          styles.searchBar,
          {
            paddingBottom: keyboardHeight > 0 ? 10 : insets.bottom || 10,
            marginBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0,
          },
        ]}
      >
        <Input
          value={query}
          onChangeText={setQuery}
          placeholder="search stations..."
          placeholderTextColor="$gray9"
          autoCorrect={false}
          size="$4"
          style={{ borderWidth: 0, backgroundColor: 'transparent', color: Colors.text }}
        />
      </YStack>
    </YStack>
  )
}
