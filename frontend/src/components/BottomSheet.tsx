// App-wide bottom sheet wrapper over @gorhom/bottom-sheet.
// Applies our design tokens (handle style, card background, rounded top corners, top shadow)
// so every sheet in the app looks consistent without repeating styles.
//
// Re-exports gorhom's content components so all screens import from one place:
//   import BottomSheet, { BottomSheetScrollView, BottomSheetFlatList } from '@/components/BottomSheet'

import GorhomBottomSheet, {
  type BottomSheetProps,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet'
import { forwardRef } from 'react'
import { StyleSheet } from 'react-native'
import { Colors, Radii, Shadows } from '@/theme'

export { BottomSheetView, BottomSheetScrollView, BottomSheetFlatList, BottomSheetTextInput }

// The ref type exposed by a BottomSheet instance.
export type BottomSheetRef = GorhomBottomSheet

const BottomSheet = forwardRef<GorhomBottomSheet, BottomSheetProps>(function BottomSheet(
  props,
  ref,
) {
  return (
    <GorhomBottomSheet
      enablePanDownToClose={false}
      enableDynamicSizing={false}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      {...props}
      ref={ref}
    />
  )
})

export default BottomSheet

const styles = StyleSheet.create({
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.separator,
  },
  background: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radii.card + 4,
    borderTopRightRadius: Radii.card + 4,
    ...Shadows.top,
  },
})
