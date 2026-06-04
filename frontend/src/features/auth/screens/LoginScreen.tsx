import type { LoginScreenProps } from '@/navigation/types'
import { AuthForm } from '@/features/auth/components/AuthForm'
import { useAuth } from '@/features/auth/context/AuthContext'

export const LoginScreen = ({ navigation }: LoginScreenProps) => {
  const { signIn } = useAuth()
  return (
    <AuthForm
      title="Log in"
      submitLabel="Log in"
      onSubmit={signIn}
      onSuccess={() => navigation.goBack()}
      onBack={() => navigation.goBack()}
      switchPrompt="Don't have an account?"
      switchLabel="Sign up"
      onSwitch={() => navigation.replace('Signup')}
    />
  )
}
