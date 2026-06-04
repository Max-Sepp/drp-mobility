import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import {
  Alert,
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TouchableOpacity,
  View,
} from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { TRAVELLER_TYPES } from '@/features/journey/lib/railcards'
import type { AccountScreenProps } from '@/navigation/types'
import { Borders, Colors, Opacity, Overlays, Radii, Shadows, Spacing } from '@/theme'
import { useAuth } from '../context/AuthContext'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'

export const AccountScreen = ({ navigation }: AccountScreenProps) => {
  const { user, signOut, updateProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  // Lazily create the Animated.Values once (stable across renders) without reading a ref
  // during render, which react-hooks/refs forbids.
  const [backdropAnim] = useState(() => new Animated.Value(0))
  const [sheetAnim] = useState(() => new Animated.Value(500))

  if (!user) {
    navigation.goBack()
    return null
  }

  const currentTravellerType = user.traveller_type ?? 'adult'
  const currentTT = TRAVELLER_TYPES.find((t) => t.code === currentTravellerType) ?? TRAVELLER_TYPES[0]

  function openPicker() {
    if (saving) return
    setModalVisible(true)
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.spring(sheetAnim, { toValue: 0, stiffness: 130, damping: 22, mass: 1, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start()
  }

  function closePicker() {
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(sheetAnim, { toValue: 500, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => setModalVisible(false))
  }

  async function handleSelect(code: string) {
    closePicker()
    if (code === currentTravellerType) return
    setSaving(true)
    try {
      await updateProfile(code, null)
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

  return (
    <FormScreenLayout
      header={<ScreenHeader title="Account" onBack={() => navigation.goBack()} />}
      footer={null}
    >
      <YStack px="$5" mt="$5" gap="$6">

        {/* Username */}
        <YStack gap="$2">
          <Text fontSize={12} fontWeight="600" color={Colors.secondaryText} letterSpacing={0.8}>
            SIGNED IN AS
          </Text>
          <XStack items="center" gap="$3" style={styles.card}>
            <Ionicons name="person-circle" size={36} color={Colors.blue} />
            <Text fontSize={15} fontWeight="600" color={Colors.text}>{user.username}</Text>
          </XStack>
        </YStack>

        {/* Traveller type trigger */}
        <YStack gap="$2">
          <Text fontSize={12} fontWeight="600" color={Colors.secondaryText} letterSpacing={0.8}>
            TRAVELLER TYPE
          </Text>
          <TouchableOpacity
            style={[styles.card, styles.triggerRow, saving && { opacity: Opacity.disabledMid }]}
            activeOpacity={Opacity.pressed}
            onPress={openPicker}
          >
            <YStack flex={1} gap={2}>
              <Text fontSize={15} fontWeight="500" color={Colors.text}>{currentTT.name}</Text>
              <Text fontSize={13} color={Colors.secondaryText} numberOfLines={1}>
                {currentTT.description}
              </Text>
            </YStack>
            <Ionicons name="chevron-down" size={16} color={Colors.secondaryText} />
          </TouchableOpacity>
        </YStack>

        {/* Sign out */}
        <XStack
          items="center"
          gap="$2"
          style={{ alignSelf: 'flex-start', paddingVertical: Spacing.sm }}
          pressStyle={{ opacity: Opacity.pressed }}
          onPress={handleSignOut}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text fontSize={15} fontWeight="600" color={Colors.danger}>Log out</Text>
        </XStack>

      </YStack>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closePicker}
      >
        <View style={styles.modalRoot}>
          {/* Backdrop fades in independently of the sheet */}
          <Animated.View
            style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropAnim }]}
            pointerEvents="none"
          />
          {/* Tap outside sheet to dismiss */}
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={closePicker}
            activeOpacity={1}
          />
          {/* Sheet slides up */}
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetAnim }] }]}>
            <View style={styles.handle} />
            <RNText style={styles.sheetTitle}>TRAVELLER TYPE</RNText>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={styles.optionList}>
              {TRAVELLER_TYPES.map((tt, i) => {
                const selected = currentTravellerType === tt.code
                const isLast = i === TRAVELLER_TYPES.length - 1
                return (
                  <TouchableOpacity
                    key={tt.code}
                    style={[styles.option, !isLast && styles.optionSeparator]}
                    activeOpacity={Opacity.pressed}
                    onPress={() => handleSelect(tt.code)}
                  >
                    <View style={{ flex: 1 }}>
                      <RNText style={[styles.optionName, selected && styles.optionNameSelected]}>
                        {tt.name}
                      </RNText>
                      <RNText style={styles.optionDesc} numberOfLines={2}>
                        {tt.description}
                      </RNText>
                    </View>
                    {selected && <Ionicons name="checkmark" size={20} color={Colors.blue} />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </FormScreenLayout>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderWidth: Borders.medium,
    borderColor: Colors.border,
    borderRadius: Radii.card,
    padding: Spacing.md,
    ...Shadows.card,
  },
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: Overlays.backdrop,
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.card + 4,
    borderTopRightRadius: Radii.card + 4,
    paddingBottom: Spacing.xl,
    overflow: 'hidden',
    ...Shadows.top,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.separator,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.secondaryText,
    letterSpacing: 0.8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  optionList: {
    maxHeight: 420,
  },
  option: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
  },
  optionSeparator: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.separator,
  },
  optionName: {
    fontSize: 15,
    fontWeight: '400' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  optionNameSelected: {
    fontWeight: '600' as const,
    color: Colors.blue,
  },
  optionDesc: {
    fontSize: 13,
    color: Colors.secondaryText,
  },
})
