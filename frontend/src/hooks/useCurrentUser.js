import { useEffect, useState } from 'react'
import { api, subscribe } from '../services/api'

/**
 * The one authoritative current-user source for components.
 *
 * `api.user` is the single stored identity (set by login, by /api/auth/me on
 * boot, and by a profile rename). This hook subscribes so any screen showing
 * the user's name re-renders the moment that identity changes.
 */
export function useCurrentUser() {
  const [user, setUser] = useState(api.user)
  useEffect(() => subscribe((next) => setUser(next.user)), [])
  return user
}

/** Real backend connection state: true, false, or null before the first probe. */
export function useBackendStatus() {
  const [connected, setConnected] = useState(api.connected)
  useEffect(() => subscribe((next) => setConnected(next.connected)), [])
  return connected
}
