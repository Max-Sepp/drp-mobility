import { useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { Input, Text, XStack, YStack } from 'tamagui'
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
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!username.trim() || !password) {
      setError('Please enter a username and password.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result = await onSubmit(username.trim(), password)
      if (result.ok) {
        setSubmitting(false)
        onSuccess()
      } else {
        setError(result.message)
        setSubmitting(false)
      }
    } catch {
      setError('Something went wrong. Please try again.')
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
        <YStack position="relative" justify="center">
          <Input
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor="$gray9"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showPassword}
            style={{ ...fieldStyle, paddingRight: 48 }}
          />
          <XStack
            position="absolute"
            r={0}
            width={44}
            height="100%"
            items="center"
            justify="center"
            pressStyle={{ opacity: 0.6 }}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color="#6b7280"
            />
          </XStack>
        </YStack>
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
