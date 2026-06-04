import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { Alert } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { parseUtc } from '@/lib/datetime'
import type { SavedJourneysScreenProps } from '@/navigation/types'
import { deleteJourney, loadSavedJourneys, type SavedJourney } from '@/features/journey/api/savedJourneys'
import { clockTime } from '@/features/journey/components/legDisplay'
import { Borders, Colors, Opacity, Radii } from '@/theme'

function savedAtLabel(iso: string): string {
  const d = parseUtc(iso)
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const SavedJourneysScreen = ({ navigation }: SavedJourneysScreenProps) => {
  const [saved, setSaved] = useState<SavedJourney[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const reload = () =>
      loadSavedJourneys()
        .then(setSaved)
        .finally(() => setLoading(false))
    reload()
    const unsubscribe = navigation.addListener('focus', reload)
    return unsubscribe
  }, [navigation])

  function confirmDelete(item: SavedJourney) {
    const label = `${item.from?.label ?? 'Start'} → ${item.to?.label ?? 'Destination'}`
    Alert.alert('Remove journey', `Remove "${label}" from your saved journeys?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await deleteJourney(item.id)
          setSaved((prev) => prev.filter((j) => j.id !== item.id))
        },
      },
    ])
  }

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Saved journeys" onBack={() => navigation.goBack()} />}
      footer={null}
    >
      {!loading && saved.length === 0 && (
        <YStack px="$5" mt="$8" items="center" gap="$2">
          <MaterialIcons name="bookmark-border" size={40} color={Colors.tertiaryText} />
          <Text fontSize={16} fontWeight="600" color={Colors.text}>
            No saved journeys yet
          </Text>
          <Text fontSize={14} color={Colors.secondaryText} style={{ textAlign: 'center' }}>
            Plan a journey, open it, and tap Save to keep it here.
          </Text>
        </YStack>
      )}

      {saved.map((item) => (
        <XStack
          key={item.id}
          mx="$5"
          mt="$4"
          p="$4"
          gap="$3"
          items="center"
          pressStyle={{ opacity: Opacity.pressed }}
          onPress={() =>
            navigation.navigate('JourneyDetail', {
              journey: item.journey,
              from: item.from,
              to: item.to,
              outages: item.outages,
              level: item.level,
              savedId: item.id,
            })
          }
          role="button"
          aria-label={`Open saved journey ${item.from?.label ?? ''} to ${item.to?.label ?? ''}`}
          style={{
            borderWidth: Borders.medium,
            borderColor: Colors.border,
            borderRadius: Radii.button,
            backgroundColor: Colors.card,
          }}
        >
          <YStack flex={1} gap="$1">
            <Text fontSize={15} fontWeight="600" color={Colors.text} numberOfLines={1}>
              {item.from?.label ?? 'Start'}
            </Text>
            <XStack items="center" gap="$1">
              <MaterialIcons name="arrow-downward" size={14} color={Colors.tertiaryText} />
              <Text fontSize={15} fontWeight="600" color={Colors.text} numberOfLines={1} flex={1}>
                {item.to?.label ?? 'Destination'}
              </Text>
            </XStack>
            <XStack items="center" gap="$2" mt="$1">
              <Text fontSize={13} color={Colors.text}>
                {item.journey.duration} min · {clockTime(item.journey.startDateTime)} →{' '}
                {clockTime(item.journey.arrivalDateTime)}
              </Text>
              {item.outages.length > 0 && <Text fontSize={13}>⚠️</Text>}
            </XStack>
            <Text fontSize={12} color={Colors.tertiaryText}>
              Saved {savedAtLabel(item.savedAt)}
            </Text>
          </YStack>

          <MaterialIcons
            name="delete-outline"
            size={22}
            color={Colors.tertiaryText}
            role="button"
            aria-label="Remove saved journey"
            onPress={() => confirmDelete(item)}
            style={{ padding: 4 }}
          />
        </XStack>
      ))}
    </FormScreenLayout>
  )
}
