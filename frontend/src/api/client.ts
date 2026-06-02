import createClient from 'openapi-fetch'
import type { paths } from './schema.d'

export const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(
  /\/$/,
  '',
)

export const apiClient = createClient<paths>({ baseUrl: BASE_URL })
