import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { RAILCARDS, findRailcard } from '@/features/journey/lib/railcards'
import type { AccountScreenProps } from '@/navigation/types'
import { Borders, Colors, Radii, Shadows, Spacing, Typography } from '@/theme'
import { useAuth } from '../context/AuthContext'

export const AccountScreen = ({ navigation }: AccountScreenProps) => {
  const { user, signOut, updateRailcard } = useAuth()
  const [saving, setSaving] = useState(false)

  if (!user) {
    navigation.goBack()
    return null
  }

  const current = findRailcard(user.railcard)

  async function handleSelect(code: string | null) {
    setSaving(true)
    try {
      await updateRailcard(code)
    } catch {
      Alert.alert('Error', 'Could not save your railcard. Please try again.')
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

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Account" onBack={() => navigation.goBack()} />}
      footer={null}
    >
      <YStack px="$5" mt="$5" gap="$6">
        {/* Username */}
        <YStack gap="$1">
          <Text style={styles.sectionLabel}>SIGNED IN AS</Text>
          <View style={styles.card}>
            <XStack items="center" gap="$3">
              <Ionicons name="person-circle" size={36} color={Colors.blue} />
              <Text style={styles.username}>{user.username}</Text>
            </XStack>
          </View>
        </YStack>

        {/* Railcard picker */}
        <YStack gap="$2">
          <Text style={styles.sectionLabel}>RAILCARD</Text>
          <Text style={styles.sectionHint}>
            Your 1/3 discount is applied to rail fares in journey results. Railcards do not apply
            to bus-only journeys.
          </Text>

          {/* None option */}
          <TouchableOpacity
            style={[styles.railcardRow, !current && styles.railcardRowSelected]}
            onPress={() => !saving && handleSelect(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.railcardName, !current && styles.railcardNameSelected]}>
              No railcard
            </Text>
            {!current && <Ionicons name="checkmark" size={20} color={Colors.blue} />}
          </TouchableOpacity>

          {RAILCARDS.map((rc) => {
            const selected = user.railcard === rc.code
            return (
              <TouchableOpacity
                key={rc.code}
                style={[styles.railcardRow, selected && styles.railcardRowSelected]}
                onPress={() => !saving && handleSelect(rc.code)}
                activeOpacity={0.7}
              >
                <YStack flex={1} gap="$0.5">
                  <Text style={[styles.railcardName, selected && styles.railcardNameSelected]}>
                    {rc.name}
                  </Text>
                  <Text style={styles.railcardDesc}>{rc.description}</Text>
                </YStack>
                {selected && <Ionicons name="checkmark" size={20} color={Colors.blue} />}
              </TouchableOpacity>
            )
          })}
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
    marginBottom: Spacing.xs,
  },
  sectionHint: {
    fontSize: 13,
    color: Colors.secondaryText,
    lineHeight: 18,
    marginBottom: Spacing.xs,
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
    fontSize: Typography.body.fontSize,
    fontWeight: '600',
    color: Colors.text,
  },
  railcardRow: {
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
  railcardRowSelected: {
    borderColor: Colors.blue,
    backgroundColor: Colors.blueBg,
  },
  railcardName: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
  },
  railcardNameSelected: {
    color: Colors.blue,
    fontWeight: '600',
  },
  railcardDesc: {
    fontSize: 13,
    color: Colors.secondaryText,
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
