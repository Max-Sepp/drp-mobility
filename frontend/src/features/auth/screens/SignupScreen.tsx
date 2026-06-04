import type { SignupScreenProps } from '@/navigation/types'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { useAuth } from '@/features/auth/context/AuthContext'

export const SignupScreen = ({ navigation }: SignupScreenProps) => {
  const { signUp } = useAuth()
  return (
    <AuthForm
      title="Sign up"
      submitLabel="Create account"
      onSubmit={signUp}
      onSuccess={() => navigation.goBack()}
      onBack={() => navigation.goBack()}
      switchPrompt="Already have an account?"
      switchLabel="Log in"
      onSwitch={() => navigation.replace('Login')}
    />
  )
}
