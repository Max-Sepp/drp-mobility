import type { ReactNode } from 'react'
import { YStack } from 'tamagui'
import { Heading } from '@/components/Heading'
import { Colors } from '@/theme'

type FormSectionProps = {
  label: string
  children: ReactNode
}

/** A labelled block in a form: a grey caption above its field(s). */
export const FormSection = ({ label, children }: FormSectionProps) => {
  return (
    <YStack px="$5" mt="$5">
      <Heading fontSize={14} fontWeight="600" color={Colors.secondaryText} mb="$2">
        {label}
      </Heading>
      {children}
    </YStack>
  )
}
