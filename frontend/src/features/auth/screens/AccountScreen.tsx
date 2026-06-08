import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
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
import { Borders, Opacity, Overlays, Spacing, useTheme, useThemeControls, THEMES } from '@/theme'
import type { ThemeId } from '@/theme'
import { useAuth } from '@/features/auth/context/AuthContext'

const USE_NATIVE_DRIVER = Platform.OS !== 'web'

export const AccountScreen = ({ navigation }: AccountScreenProps) => {
  const { user, signOut, updateProfile } = useAuth()
  const { Colors, Radii, Shadows } = useTheme()
  const { themeId, setTheme } = useThemeControls()

  const [saving, setSaving] = useState(false)
  const [travellerModalVisible, setTravellerModalVisible] = useState(false)
  const [themeModalVisible, setThemeModalVisible] = useState(false)
  const [backdropAnim] = useState(() => new Animated.Value(0))
  const [sheetAnim] = useState(() => new Animated.Value(500))
  const [themeBackdropAnim] = useState(() => new Animated.Value(0))
  const [themeSheetAnim] = useState(() => new Animated.Value(500))

  const styles = useMemo(
    () =>
      StyleSheet.create({
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
          maxHeight: 480,
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
        themeSwatch: {
          width: 20,
          height: 20,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: Colors.separator,
        },
      }),
    [Colors, Radii, Shadows],
  )

  if (!user) {
    navigation.goBack()
    return null
  }

  const currentTravellerType = user.traveller_type ?? 'adult'
  const currentTT =
    TRAVELLER_TYPES.find((t) => t.code === currentTravellerType) ?? TRAVELLER_TYPES[0]

  const currentTheme = THEMES[themeId]
  const allThemes = Object.values(THEMES)

  // ---------------------------------------------------------------------------
  // Traveller type picker
  // ---------------------------------------------------------------------------

  function openTravellerPicker() {
    if (saving) return
    setTravellerModalVisible(true)
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 1, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.spring(sheetAnim, { toValue: 0, stiffness: 130, damping: 22, mass: 1, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start()
  }

  function closeTravellerPicker() {
    Animated.parallel([
      Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(sheetAnim, { toValue: 500, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => setTravellerModalVisible(false))
  }

  async function handleSelectTraveller(code: string) {
    closeTravellerPicker()
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

  // ---------------------------------------------------------------------------
  // Theme picker
  // ---------------------------------------------------------------------------

  function openThemePicker() {
    setThemeModalVisible(true)
    Animated.parallel([
      Animated.timing(themeBackdropAnim, { toValue: 1, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.spring(themeSheetAnim, { toValue: 0, stiffness: 130, damping: 22, mass: 1, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start()
  }

  function closeThemePicker() {
    Animated.parallel([
      Animated.timing(themeBackdropAnim, { toValue: 0, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(themeSheetAnim, { toValue: 500, duration: 220, useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start(() => setThemeModalVisible(false))
  }

  function handleSelectTheme(id: ThemeId) {
    setTheme(id)
    closeThemePicker()
  }

  // ---------------------------------------------------------------------------
  // Sign out
  // ---------------------------------------------------------------------------

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
            <Text fontSize={15} fontWeight="600" color={Colors.text}>
              {user.username}
            </Text>
          </XStack>
        </YStack>

        {/* Traveller type */}
        <YStack gap="$2">
          <Text fontSize={12} fontWeight="600" color={Colors.secondaryText} letterSpacing={0.8}>
            TRAVELLER TYPE
          </Text>
          <TouchableOpacity
            style={[styles.card, styles.triggerRow, saving && { opacity: Opacity.disabledMid }]}
            activeOpacity={Opacity.pressed}
            onPress={openTravellerPicker}
          >
            <YStack flex={1} gap={2}>
              <Text fontSize={15} fontWeight="500" color={Colors.text}>
                {currentTT.name}
              </Text>
              <Text fontSize={13} color={Colors.secondaryText} numberOfLines={1}>
                {currentTT.description}
              </Text>
            </YStack>
            <Ionicons name="chevron-down" size={16} color={Colors.secondaryText} />
          </TouchableOpacity>
        </YStack>

        {/* Appearance / theme */}
        <YStack gap="$2">
          <Text fontSize={12} fontWeight="600" color={Colors.secondaryText} letterSpacing={0.8}>
            APPEARANCE
          </Text>
          <TouchableOpacity
            style={[styles.card, styles.triggerRow]}
            activeOpacity={Opacity.pressed}
            onPress={openThemePicker}
          >
            <View style={[styles.themeSwatch, { backgroundColor: currentTheme.Colors.card, borderColor: currentTheme.Colors.border }]} />
            <YStack flex={1} gap={2}>
              <Text fontSize={15} fontWeight="500" color={Colors.text}>
                {currentTheme.label}
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
          <Text fontSize={15} fontWeight="600" color={Colors.danger}>
            Log out
          </Text>
        </XStack>
      </YStack>

      {/* Traveller type modal */}
      <Modal visible={travellerModalVisible} transparent animationType="none" onRequestClose={closeTravellerPicker}>
        <View style={styles.modalRoot}>
          <Animated.View
            style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: backdropAnim }]}
            pointerEvents="none"
          />
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeTravellerPicker} activeOpacity={1} />
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
                    onPress={() => handleSelectTraveller(tt.code)}
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

      {/* Theme modal */}
      <Modal visible={themeModalVisible} transparent animationType="none" onRequestClose={closeThemePicker}>
        <View style={styles.modalRoot}>
          <Animated.View
            style={[StyleSheet.absoluteFillObject, styles.backdrop, { opacity: themeBackdropAnim }]}
            pointerEvents="none"
          />
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeThemePicker} activeOpacity={1} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: themeSheetAnim }] }]}>
            <View style={styles.handle} />
            <RNText style={styles.sheetTitle}>APPEARANCE</RNText>
            <ScrollView showsVerticalScrollIndicator={false} bounces={false} style={styles.optionList}>
              {allThemes.map((t, i) => {
                const selected = themeId === t.id
                const isLast = i === allThemes.length - 1
                return (
                  <TouchableOpacity
                    key={t.id}
                    style={[styles.option, !isLast && styles.optionSeparator]}
                    activeOpacity={Opacity.pressed}
                    onPress={() => handleSelectTheme(t.id)}
                  >
                    <View style={[styles.themeSwatch, { backgroundColor: t.Colors.card, borderColor: t.Colors.border }]} />
                    <View style={{ flex: 1 }}>
                      <RNText style={[styles.optionName, selected && styles.optionNameSelected]}>
                        {t.label}
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
