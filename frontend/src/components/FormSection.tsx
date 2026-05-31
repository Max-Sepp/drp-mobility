import type { ReactNode } from 'react'
import { Text, YStack } from 'tamagui'

type FormSectionProps = {
  label: string
  children: ReactNode
}

/** A labelled block in a form: a grey caption above its field(s). */
export default function FormSection({ label, children }: FormSectionProps) {
  return (
    <YStack px="$5" mt="$5">
      <Text fontSize={14} fontWeight="600" color="#6b7280" mb="$2">{label}</Text>
      {children}
    </YStack>
  )
}
