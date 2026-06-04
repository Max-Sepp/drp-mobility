import createClient from 'openapi-fetch'
import { getAuthToken } from '@/api/authToken'
import type { paths } from '@/api/schema.d'

export const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

export const apiClient = createClient<paths>({ baseUrl: BASE_URL })

// Attach the current session token (if any) as a Bearer header on every request. Endpoints that
// accept anonymous callers simply ignore a missing header; authenticated ones get the credential.
apiClient.use({
  onRequest({ request }) {
    const token = getAuthToken()
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
})
