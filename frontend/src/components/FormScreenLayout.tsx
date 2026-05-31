import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'
import { ScrollView } from 'tamagui'

type FormScreenLayoutProps = {
  header: ReactNode
  footer: ReactNode
  children: ReactNode
}

/** Keyboard-aware scaffold for the report forms: a pinned header, a scrolling body, and a pinned footer. */
export default function FormScreenLayout({ header, footer, children }: FormScreenLayoutProps) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'white' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView flex={1} style={{ backgroundColor: 'white' }} contentContainerStyle={{ paddingBottom: 16 } as any} keyboardShouldPersistTaps="handled">
        {header}
        {children}
      </ScrollView>
      {footer}
    </KeyboardAvoidingView>
  )
}
