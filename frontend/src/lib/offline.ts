// Shared detection and messaging for "the device is offline" failures. Network-dependent
// actions (journey planning, geocoding, reporting) all go out over `fetch`; when there's no
// connection React Native rejects with a `TypeError`, which is distinct from an HTTP error
// status. Use these helpers so every flow gives the same clear, trustworthy offline feedback
// rather than failing silently.

import { Alert } from 'react-native'

/**
 * True if `err` is a `fetch` that failed because the device couldn't reach the network (offline,
 * or the host is unreachable). React Native rejects such calls with a `TypeError` whose message
 * is "Network request failed" — there's no `Response`, so this is distinct from a 4xx/5xx.
 */
export function isOfflineError(err: unknown): boolean {
  return err instanceof TypeError && /network request failed/i.test(err.message)
}

/**
 * Show the standard "you're offline" alert. `action` completes the sentence
 * "Couldn't <action> …", e.g. `alertOffline('plan a journey')`.
 */
export function alertOffline(action = 'do that'): void {
  Alert.alert(
    'No internet connection',
    `Couldn't ${action} — you appear to be offline. Reconnect to the internet and try again.`,
  )
}
