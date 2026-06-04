import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { RAILCARDS, TRAVELLER_TYPES } from '@/features/journey/lib/railcards'
import type { AccountScreenProps } from '@/navigation/types'
import { Borders, Colors, Radii, Shadows, Spacing, Typography } from '@/theme'
import { useAuth } from '../context/AuthContext'

export const AccountScreen = ({ navigation }: AccountScreenProps) => {
  const { user, signOut, updateProfile } = useAuth()
  const [saving, setSaving] = useState(false)

  if (!user) {
    navigation.goBack()
    return null
  }

  async function handleSelect(travellerType: string | null, railcard: string | null) {
    setSaving(true)
    try {
      await updateProfile(travellerType, railcard)
    } catch {
      Alert.alert('Error', 'Could not save your preferences. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    Alert.alert('Log out', `Log out of ${user!.username}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await signOut()
          navigation.goBack()
        },
      },
    ])
  }

  const currentTravellerType = user.traveller_type ?? 'adult'
  const currentRailcard = user.railcard ?? null

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Account" onBack={() => navigation.goBack()} />}
      footer={null}
    >
      <YStack px="$5" mt="$5" gap="$6">

        {/* Username */}
        <YStack gap="$2">
          <Text style={styles.sectionLabel}>SIGNED IN AS</Text>
          <View style={styles.card}>
            <XStack items="center" gap="$3">
              <Ionicons name="person-circle" size={36} color={Colors.blue} />
              <Text style={styles.username}>{user.username}</Text>
            </XStack>
          </View>
        </YStack>

        {/* Traveller type */}
        <YStack gap="$2">
          <Text style={styles.sectionLabel}>TRAVELLER TYPE</Text>
          {TRAVELLER_TYPES.map((tt) => {
            const selected = currentTravellerType === tt.code
            return (
              <TouchableOpacity
                key={tt.code}
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => !saving && handleSelect(tt.code, currentRailcard)}
                activeOpacity={0.7}
              >
                <YStack flex={1} gap="$0.5">
                  <Text style={[styles.rowName, selected && styles.rowNameSelected]}>
                    {tt.name}
                  </Text>
                  <Text style={styles.rowDesc}>{tt.description}</Text>
                </YStack>
                {selected && <Ionicons name="checkmark" size={20} color={Colors.blue} />}
              </TouchableOpacity>
            )
          })}
        </YStack>

        {/* Railcard */}
        <YStack gap="$2">
          <Text style={styles.sectionLabel}>RAILCARD</Text>

          {/* None */}
          <TouchableOpacity
            style={[styles.row, !currentRailcard && styles.rowSelected]}
            onPress={() => !saving && handleSelect(currentTravellerType, null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowName, !currentRailcard && styles.rowNameSelected]}>
              None
            </Text>
            {!currentRailcard && <Ionicons name="checkmark" size={20} color={Colors.blue} />}
          </TouchableOpacity>

          {RAILCARDS.map((rc) => {
            const selected = currentRailcard === rc.code
            return (
              <TouchableOpacity
                key={rc.code}
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => !saving && handleSelect(currentTravellerType, rc.code)}
                activeOpacity={0.7}
              >
                <YStack flex={1} gap="$0.5">
                  <Text style={[styles.rowName, selected && styles.rowNameSelected]}>
                    {rc.name}
                  </Text>
                  <Text style={styles.rowDesc}>{rc.description}</Text>
                </YStack>
                {selected && <Ionicons name="checkmark" size={20} color={Colors.blue} />}
              </TouchableOpacity>
            )
          })}

          <XStack gap="$2" items="flex-start" mt="$1">
            <Ionicons name="information-circle-outline" size={15} color={Colors.secondaryText} style={{ marginTop: 1 }} />
            <Text style={styles.notice}>
              Railcard discounts only apply when your railcard is registered with your Oyster card.
            </Text>
          </XStack>
        </YStack>

        {/* Sign out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.signOutLabel}>Log out</Text>
        </TouchableOpacity>

      </YStack>
    </FormScreenLayout>
  )
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.secondaryText,
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: Colors.card,
    borderWidth: Borders.medium,
    borderColor: Colors.border,
    borderRadius: Radii.card,
    padding: Spacing.md,
    ...Shadows.card,
  },
  username: {
    ...Typography.body,
    fontWeight: '600',
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderWidth: Borders.medium,
    borderColor: Colors.border,
    borderRadius: Radii.card,
    padding: Spacing.md,
    ...Shadows.card,
  },
  rowSelected: {
    borderColor: Colors.blue,
    backgroundColor: Colors.blueBg,
  },
  rowName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  rowNameSelected: {
    color: Colors.blue,
    fontWeight: '600',
  },
  rowDesc: {
    fontSize: 13,
    color: Colors.secondaryText,
  },
  notice: {
    fontSize: 13,
    color: Colors.secondaryText,
    flex: 1,
    lineHeight: 18,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  signOutLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.danger,
  },
})
