import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { getAuthToken, setAuthToken } from '@/api/authToken'
import {
  type AuthUser,
  deleteToken,
  fetchMe,
  isAuthError,
  loadToken,
  login,
  logout,
  patchProfile,
  saveToken,
  signup,
} from '@/features/auth/api/auth'
import {
  deregisterPushToken,
  getActivePushToken,
  setActivePushToken,
} from '@/features/auth/api/pushToken'

// 'loading' only covers the initial token check on launch; the UI stays usable anonymously and
// never blocks on it. 'authed'/'unauthed' reflect whether a valid session is currently held.
type AuthStatus = 'loading' | 'authed' | 'unauthed'

type AuthResult = { ok: true } | { ok: false; message: string }

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  signIn: (username: string, password: string) => Promise<AuthResult>
  signUp: (username: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
  updateProfile: (travellerType: string | null, railcard: string | null) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)

  // On launch, restore any stored token and validate it against the backend.
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const stored = await loadToken()
        if (!stored) {
          if (active) setStatus('unauthed')
          return
        }
        setAuthToken(stored)
        const me = await fetchMe()
        if (!active) return
        if (me) {
          setUser(me)
          setStatus('authed')
        } else {
          // Stored token is stale/invalid — drop it.
          setAuthToken(null)
          await deleteToken()
          setStatus('unauthed')
        }
      } catch {
        // Network unreachable on launch (e.g. no backend reachable from device) — treat as
        // unauthenticated so the UI doesn't stay frozen on 'loading'.
        if (active) setStatus('unauthed')
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function establishSession(token: string, nextUser: AuthUser): Promise<void> {
    setAuthToken(token)
    await saveToken(token)
    setUser(nextUser)
    setStatus('authed')
  }

  async function signIn(username: string, password: string): Promise<AuthResult> {
    const result = await login(username, password)
    if (isAuthError(result)) return { ok: false, message: result.message }
    await establishSession(result.token, result.user)
    return { ok: true }
  }

  async function signUp(username: string, password: string): Promise<AuthResult> {
    const result = await signup(username, password)
    if (isAuthError(result)) return { ok: false, message: result.message }
    await establishSession(result.token, result.user)
    return { ok: true }
  }

  async function updateProfile(
    travellerType: string | null,
    railcard: string | null,
  ): Promise<void> {
    const updated = await patchProfile(travellerType, railcard)
    if (updated) setUser(updated)
  }

  async function signOut(): Promise<void> {
    // Deregister the push token and invalidate the session while the auth token is still
    // attached, then clear local state.
    const pushToken = getActivePushToken()
    if (getAuthToken()) {
      await Promise.all([pushToken ? deregisterPushToken(pushToken) : Promise.resolve(), logout()])
    }
    setActivePushToken(null)
    setAuthToken(null)
    await deleteToken()
    setUser(null)
    setStatus('unauthed')
  }

  return (
    <AuthContext.Provider value={{ status, user, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
