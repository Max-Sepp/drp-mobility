// App-wide bottom sheet wrapper over @gorhom/bottom-sheet.
// Applies our design tokens (handle style, card background, rounded top corners, top shadow)
// so every sheet in the app looks consistent without repeating styles.
//
// Re-exports gorhom's content components so all screens import from one place:
//   import BottomSheet, { BottomSheetScrollView, BottomSheetFlatList } from '@/components/BottomSheet'

import GorhomBottomSheet, {
  type BottomSheetProps,
  type BottomSheetBackdropProps,
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet'
import { forwardRef, useCallback, useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { useTheme, Borders } from '@/theme'

export { BottomSheetView, BottomSheetScrollView, BottomSheetFlatList, BottomSheetTextInput }

// The ref type exposed by a BottomSheet instance.
export type BottomSheetRef = GorhomBottomSheet

const BottomSheet = forwardRef<GorhomBottomSheet, BottomSheetProps>(
  function BottomSheet(props, ref) {
    const { Colors, Radii } = useTheme()
    const { enablePanDownToClose = false, backdropComponent, ...rest } = props

    // When a sheet is dismissible, provide a transparent backdrop so tapping the map
    // above the sheet closes it — no dimming, just touch interception.
    const transparentBackdrop = useCallback(
      (backdropProps: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...backdropProps}
          opacity={0}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      ),
      [],
    )

    const styles = useMemo(
      () =>
        StyleSheet.create({
          handle: {
            width: 36,
            height: 4,
            backgroundColor: Colors.separator,
          },
          background: {
            backgroundColor: Colors.card,
            borderTopLeftRadius: Radii.card + 4,
            borderTopRightRadius: Radii.card + 4,
            borderWidth: Borders.medium,
            borderColor: Colors.border,
          },
        }),
      [Colors, Radii],
    )

    const resolvedBackdrop =
      backdropComponent !== undefined
        ? backdropComponent
        : enablePanDownToClose
          ? transparentBackdrop
          : null

    return (
      <GorhomBottomSheet
        enablePanDownToClose={enablePanDownToClose}
        enableDynamicSizing={false}
        animationConfigs={{ damping: 24, stiffness: 200 }}
        handleIndicatorStyle={styles.handle}
        backgroundStyle={styles.background}
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        backdropComponent={resolvedBackdrop ?? undefined}
        {...rest}
        ref={ref}
      />
    )
  },
)

export default BottomSheet
