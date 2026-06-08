import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { ScrollView } from 'tamagui'
import { useTheme } from '@/theme'

type FormScreenLayoutProps = {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}

/** Keyboard-aware scaffold for the report forms: a pinned header, a scrolling body, and a pinned footer. */
export const FormScreenLayout = ({ header, footer, children }: FormScreenLayoutProps) => {
  const { Colors } = useTheme()
  // On Android, Expo already resizes the window for the keyboard (adjustResize); adding
  // behavior="height" on top of that double-counts and leaves dead space at the bottom, so
  // we only set a behavior on iOS.
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.card }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        flex={1}
        style={{ backgroundColor: Colors.card }}
        contentContainerStyle={{ paddingBottom: 16 } as any}
        keyboardShouldPersistTaps="handled"
      >
        {header}
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  )
}
