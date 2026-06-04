import { BASE_URL } from '@/api/client'
import { getAuthToken } from '@/api/authToken'

// Module-level store for the device's current Expo push token. Written by
// usePushNotifications after successful registration; read by signOut so the token can be
// deregistered on the backend before the session token is cleared.
let _activePushToken: string | null = null

export function setActivePushToken(token: string | null): void {
  _activePushToken = token
}

export function getActivePushToken(): string | null {
  return _activePushToken
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function registerPushToken(token: string): Promise<void> {
  await fetch(`${BASE_URL}/users/me/push-token`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ token }),
  })
}

export async function deregisterPushToken(token: string): Promise<void> {
  await fetch(`${BASE_URL}/users/me/push-token`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ token }),
  })
}
