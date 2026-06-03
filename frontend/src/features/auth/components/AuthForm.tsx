import { useState } from 'react'
import { Input, Text, XStack } from 'tamagui'
import { ScreenHeader } from '@/components/ScreenHeader'
import { FormScreenLayout } from '@/features/reporting/components/FormScreenLayout'
import { FormSection } from '@/features/reporting/components/FormSection'
import { SubmitBar } from '@/features/reporting/components/SubmitBar'

const fieldStyle = {
  borderColor: '#d1d5db',
  backgroundColor: '#f9fafb',
  color: '#111827',
  fontSize: 15,
}

type AuthResult = { ok: true } | { ok: false; message: string }

type AuthFormProps = {
  title: string
  submitLabel: string
  onSubmit: (username: string, password: string) => Promise<AuthResult>
  onSuccess: () => void
  onBack: () => void
  switchPrompt: string
  switchLabel: string
  onSwitch: () => void
}

/** Shared username/password form for the login and signup screens. */
export const AuthForm = ({
  title,
  submitLabel,
  onSubmit,
  onSuccess,
  onBack,
  switchPrompt,
  switchLabel,
  onSwitch,
}: AuthFormProps) => {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!username.trim() || !password) {
      setError('Please enter a username and password.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await onSubmit(username.trim(), password)
    if (result.ok) {
      onSuccess()
    } else {
      setError(result.message)
      setSubmitting(false)
    }
  }

  return (
    <FormScreenLayout
      header={<ScreenHeader title={title} onBack={onBack} />}
      footer={<SubmitBar onPress={submit} submitting={submitting} label={submitLabel} />}
    >
      <FormSection label="Username">
        <Input
          value={username}
          onChangeText={setUsername}
          placeholder="Your username"
          placeholderTextColor="$gray9"
          autoCapitalize="none"
          autoCorrect={false}
          style={fieldStyle}
        />
      </FormSection>

      <FormSection label="Password">
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          placeholderTextColor="$gray9"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={fieldStyle}
        />
      </FormSection>

      {error && (
        <Text px="$5" mt="$3" fontSize={14} color="#dc2626">
          {error}
        </Text>
      )}

      <XStack px="$5" mt="$5" gap="$2" items="center" justify="center">
        <Text fontSize={14} color="#6b7280">
          {switchPrompt}
        </Text>
        <Text
          fontSize={14}
          fontWeight="700"
          color="#2563eb"
          pressStyle={{ opacity: 0.6 }}
          onPress={onSwitch}
        >
          {switchLabel}
        </Text>
      </XStack>
    </FormScreenLayout>
  )
}
