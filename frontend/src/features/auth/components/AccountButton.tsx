import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { Text, XStack } from 'tamagui'
import type { RootStackParamList } from '@/navigation/types'
import { useAuth } from '@/features/auth/context/AuthContext'

/** Header affordance: "Log in" when anonymous, the username + "Log out" when authenticated. */
export const AccountButton = () => {
  const { status, user, signOut } = useAuth()
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  // Avoid flicker during the launch-time token check.
  if (status === 'loading') return null

  if (status === 'authed' && user) {
    return (
      <XStack
        items="center"
        gap="$1"
        pressStyle={{ opacity: 0.6 }}
        onPress={() => {
          void signOut()
        }}
        role="button"
        aria-label={`Logged in as ${user.username}, log out`}
      >
        <Ionicons name="log-out-outline" size={18} color="#2563eb" />
        <Text fontSize={14} fontWeight="600" color="#2563eb" numberOfLines={1}>
          {user.username}
        </Text>
      </XStack>
    )
  }

  return (
    <XStack
      items="center"
      gap="$1"
      pressStyle={{ opacity: 0.6 }}
      onPress={() => navigation.navigate('Login')}
      role="button"
      aria-label="Log in"
    >
      <Ionicons name="person-circle-outline" size={18} color="#2563eb" />
      <Text fontSize={14} fontWeight="600" color="#2563eb">
        Log in
      </Text>
    </XStack>
  )
}
