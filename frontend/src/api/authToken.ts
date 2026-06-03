// In-memory holder for the current session token. Kept separate from the AuthContext so the
// openapi-fetch request middleware (src/api/client.ts) can read it synchronously without importing
// React state. The AuthProvider is the single writer: it sets the token after login/signup (and on
// launch from SecureStore) and clears it on logout.

let token: string | null = null

export function setAuthToken(value: string | null): void {
  token = value
}

export function getAuthToken(): string | null {
  return token
}
