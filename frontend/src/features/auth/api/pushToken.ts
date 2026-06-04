import { BASE_URL } from '@/api/client'
import { getAuthToken } from '@/api/authToken'

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
