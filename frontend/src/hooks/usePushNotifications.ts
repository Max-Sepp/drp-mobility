import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { useAuth } from '@/features/auth/context/AuthContext'
import { registerPushToken } from '@/features/auth/api/pushToken'
import { navigationRef } from '@/navigation/navigationRef'

// Show notifications even when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

function handleNotificationTap(response: Notifications.NotificationResponse): void {
  const data = response.notification.request.content.data as Record<string, unknown>
  const stationName = typeof data?.station_name === 'string' ? data.station_name : null
  if (stationName && navigationRef.isReady()) {
    navigationRef.navigate('Station', { station: stationName })
  }
}

/**
 * Manages push notification permissions, Expo token registration, and notification tap
 * routing. Call once inside a component that is a child of AuthProvider (e.g. AppContent
 * in App.tsx). All notification logic — including what happens when the user taps a
 * notification — is encapsulated here so callers stay decoupled from notification specifics.
 */
export function usePushNotifications(): void {
  const { status } = useAuth()
  const tokenRef = useRef<string | null>(null)

  // Register (or refresh) the push token whenever the user is authenticated.
  useEffect(() => {
    if (status !== 'authed') return

    let cancelled = false

    async function register() {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Accessibility alerts',
          importance: Notifications.AndroidImportance.MAX,
        })
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync()
      let finalStatus = existingStatus
      if (existingStatus !== 'granted') {
        const { status: requested } = await Notifications.requestPermissionsAsync()
        finalStatus = requested
      }
      if (finalStatus !== 'granted') return

      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: 'fa941353-94dc-490c-a5b0-209e52e4ee56',
      })

      if (cancelled) return
      tokenRef.current = token
      await registerPushToken(token)
    }

    register().catch(() => {
      // Best-effort: push notifications are additive and must never block the app.
    })

    return () => {
      cancelled = true
    }
  }, [status])

  // Navigate to the relevant station when the user taps a notification.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationTap)
    return () => subscription.remove()
  }, [])
}
