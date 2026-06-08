// Search screen presented as a slide-up bottom sheet over the map.
// The route uses presentation:'transparentModal' + animation:'none' so the map
// remains visible underneath. We drive all animation ourselves:
//   - backdrop fades in (Animated.timing)
//   - card springs up from below (Animated.spring, two-phase for extra frames)
// Dismiss mirrors this in reverse before calling navigation.goBack().

import { MaterialIcons } from '@expo/vector-icons'
import { useEffect, useMemo, useState } from 'react'
import {
  Animated,
  Dimensions,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/navigation/types'
import { useTheme, Overlays, Spacing, Typography } from '@/theme'

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>

// The card rises to cover ~78% of the screen, leaving ~22% of the map visible above.
const { height: SCREEN_H } = Dimensions.get('window')
const CARD_HEIGHT = SCREEN_H * 0.78

// ---------------------------------------------------------------------------
// Animation helpers
// ---------------------------------------------------------------------------

function useSlideUp() {
  // 0 = card fully visible; CARD_HEIGHT = card fully off-screen at bottom
  const [slideY] = useState(() => new Animated.Value(CARD_HEIGHT))
  const [backdropOpacity] = useState(() => new Animated.Value(0))

  function enter() {
    // Two-phase spring for extra frames:
    //  phase 1: quick initial jump (~30% of travel) using a stiff spring
    //  phase 2: settle into place with a softer spring
    // Both run on the native thread.
    Animated.parallel([
      Animated.sequence([
        Animated.spring(slideY, {
          toValue: CARD_HEIGHT * 0.3,
          damping: 40,
          stiffness: 600,
          mass: 0.6,
          useNativeDriver: true,
        }),
        Animated.spring(slideY, {
          toValue: 0,
          damping: 22,
          stiffness: 260,
          mass: 0.9,
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start()
  }

  function exit(onDone: () => void) {
    Keyboard.dismiss()
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: CARD_HEIGHT,
        damping: 28,
        stiffness: 300,
        mass: 0.7,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onDone())
  }

  return { slideY, backdropOpacity, enter, exit }
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export function SearchScreen({ navigation }: Props) {
  const { Colors, Radii, Shadows } = useTheme()
  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: Overlays.backdrop,
        },
        card: {
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: CARD_HEIGHT,
          backgroundColor: Colors.card,
          borderTopLeftRadius: Radii.card + 4,
          borderTopRightRadius: Radii.card + 4,
          ...Shadows.heavy,
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
        },
        handle: {
          width: 36,
          height: 4,
          borderRadius: Radii.handle,
          backgroundColor: Colors.separator,
          alignSelf: 'center',
          marginBottom: Spacing.md,
        },
        searchRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          marginBottom: Spacing.md,
        },
        searchInputWrap: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: Colors.searchBg,
          borderRadius: Radii.pill,
          paddingHorizontal: Spacing.md,
          paddingVertical: 9,
        },
        input: {
          flex: 1,
          fontSize: 15,
          color: Colors.text,
          padding: 0,
        },
        body: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Spacing.xxl,
        },
      }),
    [Colors, Radii, Shadows],
  )
  const insets = useSafeAreaInsets()
  const { slideY, backdropOpacity, enter, exit } = useSlideUp()

  useEffect(() => {
    enter()
  }, [])

  function dismiss() {
    exit(() => navigation.goBack())
  }

  return (
    // pointerEvents="box-none" lets touches on transparent areas fall through
    // to the backdrop TouchableWithoutFeedback, but the card itself is solid.
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
      {/* Dimmed backdrop — tapping it dismisses */}
      <TouchableWithoutFeedback onPress={dismiss}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>

      {/* Sliding card */}
      <Animated.View
        style={[
          styles.card,
          { paddingBottom: insets.bottom + Spacing.md },
          { transform: [{ translateY: slideY }] },
          { pointerEvents: 'box-none' },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Search row */}
        <View style={styles.searchRow}>
          <View style={styles.searchInputWrap}>
            <MaterialIcons
              name="search"
              size={18}
              color={Colors.secondaryText}
              style={{ marginRight: 6 }}
            />
            <TextInput
              style={styles.input}
              placeholder="Search stations or places…"
              placeholderTextColor={Colors.placeholderText}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>
          <TouchableOpacity onPress={dismiss} activeOpacity={0.7}>
            <Text style={[Typography.bodyBold, { color: Colors.blue }]}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Placeholder body — Stage 2 will put results here */}
        <View style={styles.body}>
          <MaterialIcons name="search" size={44} color={Colors.tertiaryText} />
          <Text style={[Typography.sectionTitle, { color: Colors.text, marginTop: Spacing.md }]}>
            Search coming soon
          </Text>
          <Text
            style={[
              Typography.caption,
              { color: Colors.secondaryText, textAlign: 'center', marginTop: Spacing.sm },
            ]}
          >
            Stations and address search will appear here in the next update.
          </Text>
        </View>
      </Animated.View>
    </View>
  )
}

