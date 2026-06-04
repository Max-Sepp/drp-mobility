import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { apiClient } from '@/api/client'
import type { components } from '@/api/schema.d'

export type AuthUser = components['schemas']['UserPublic']
type AuthResponse = components['schemas']['AuthResponse']

// SecureStore keys must be alphanumeric plus ".", "-", "_" — no "@/" prefix like the AsyncStorage
// journey keys use.
const TOKEN_KEY = 'drp_session_token'

type AuthError = { message: string }

/** Create an account. Returns the session token + user, or an error message to show inline. */
export async function signup(
  username: string,
  password: string,
): Promise<AuthResponse | AuthError> {
  const { data, error, response } = await apiClient.POST('/auth/signup', {
    body: { username, password },
  })
  if (data) return data
  if (response.status === 409) return { message: 'That username is already taken.' }
  return { message: errorMessage(error) }
}

/** Log in with existing credentials. Returns the session token + user, or an error message. */
export async function login(username: string, password: string): Promise<AuthResponse | AuthError> {
  const { data, error, response } = await apiClient.POST('/auth/login', {
    body: { username, password },
  })
  if (data) return data
  if (response.status === 401) return { message: 'Incorrect username or password.' }
  return { message: errorMessage(error) }
}

/** Invalidate the session server-side. Best-effort: a network failure still clears local state. */
export async function logout(): Promise<void> {
  try {
    await apiClient.POST('/auth/logout')
  } catch {
    // Ignore — the caller clears the local token regardless.
  }
}

/** Validate a stored token on launch, returning the user it belongs to (or null if invalid). */
export async function fetchMe(): Promise<AuthUser | null> {
  const { data } = await apiClient.GET('/auth/me')
  return data ?? null
}

/** Update the authenticated user's traveller type and railcard. Returns the updated user or null on error. */
export async function patchProfile(
  travellerType: string | null,
  railcard: string | null,
): Promise<AuthUser | null> {
  const { data } = await apiClient.PATCH('/auth/me', {
    body: { traveller_type: travellerType, railcard },
  })
  return data ?? null
}

// ---------------------------------------------------------------------------
// Token persistence (encrypted device storage, localStorage fallback on web)
// ---------------------------------------------------------------------------

export async function saveToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token)
  }
}

export async function loadToken(): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(TOKEN_KEY)
  return SecureStore.getItemAsync(TOKEN_KEY)
}

export async function deleteToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY)
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
  }
}

export function isAuthError(result: AuthResponse | AuthError): result is AuthError {
  return 'message' in result
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'detail' in error) {
    const detail = (error as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
  }
  return 'Something went wrong. Please try again.'
}
