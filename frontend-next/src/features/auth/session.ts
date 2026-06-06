import { readJsonStorage } from '@/shared/lib/storage'
import { SESSION_STORAGE_KEY } from './auth-store'
import type { SessionSnapshot, SessionUser } from './auth-store'

type StoredSession = {
  accessToken: string
  currentUser: SessionUser
}

/**
 * Synchronously reads the stored session from localStorage.
 * Used by route `beforeLoad` guards which run outside React context.
 */
export function getStoredSession(): SessionSnapshot {
  const stored = readJsonStorage<StoredSession>(SESSION_STORAGE_KEY)
  if (!stored?.accessToken || !stored.currentUser) {
    return { accessToken: null, currentUser: null, isAuthenticated: false }
  }
  return {
    accessToken: stored.accessToken,
    currentUser: stored.currentUser,
    isAuthenticated: true,
  }
}
