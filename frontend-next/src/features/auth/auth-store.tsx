import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

import {
  readJsonStorage,
  removeStorageItem,
  writeJsonStorage,
} from '@/shared/lib/storage'
import type { UserRead } from '@/shared/types/api'

export const SESSION_STORAGE_KEY = 'cvd.auth.session'

export type SessionUser = UserRead

export type SessionSnapshot = {
  accessToken: string | null
  currentUser: SessionUser | null
  isAuthenticated: boolean
}

type AuthContextValue = {
  session: SessionSnapshot
  setSession: (session: SessionSnapshot) => void
  clearSession: () => void
}

export function createSessionSnapshot(
  accessToken: string | null,
  currentUser: SessionUser | null = null,
): SessionSnapshot {
  return {
    accessToken,
    currentUser,
    isAuthenticated: accessToken !== null,
  }
}

const defaultSession = createSessionSnapshot(null)

const defaultContextValue: AuthContextValue = {
  session: defaultSession,
  setSession: () => undefined,
  clearSession: () => undefined,
}

type StoredSession = {
  accessToken: string
  currentUser: SessionUser
}

function restoreSessionSnapshot() {
  const storedSession = readJsonStorage<StoredSession>(SESSION_STORAGE_KEY)
  if (!storedSession?.accessToken || !storedSession.currentUser) {
    return defaultSession
  }
  return createSessionSnapshot(
    storedSession.accessToken,
    storedSession.currentUser,
  )
}

function parseStoredSession(rawValue: string | null) {
  if (!rawValue) return defaultSession
  try {
    const storedSession = JSON.parse(rawValue) as StoredSession
    return storedSession.accessToken && storedSession.currentUser
      ? createSessionSnapshot(
          storedSession.accessToken,
          storedSession.currentUser,
        )
      : defaultSession
  } catch {
    return defaultSession
  }
}

function persistSession(snapshot: SessionSnapshot) {
  if (!snapshot.accessToken || !snapshot.currentUser) {
    removeStorageItem(SESSION_STORAGE_KEY)
    return
  }
  writeJsonStorage(SESSION_STORAGE_KEY, {
    accessToken: snapshot.accessToken,
    currentUser: snapshot.currentUser,
  })
}

const AuthContext = createContext<AuthContextValue>(defaultContextValue)

export function AuthProvider({
  children,
  value,
  onStorageSessionChange,
}: {
  children: ReactNode
  value?: Pick<AuthContextValue, 'session'>
  onStorageSessionChange?: (session: SessionSnapshot) => void
}) {
  const [session, setSessionState] = useState(restoreSessionSnapshot)

  const setSession = (nextSession: SessionSnapshot) => {
    persistSession(nextSession)
    setSessionState(nextSession)
  }

  const clearSession = () => {
    removeStorageItem(SESSION_STORAGE_KEY)
    setSessionState(defaultSession)
  }

  useEffect(() => {
    const syncSession = (event: StorageEvent) => {
      if (event.key === SESSION_STORAGE_KEY) {
        const nextSession = parseStoredSession(event.newValue)
        setSessionState(nextSession)
        onStorageSessionChange?.(nextSession)
      }
    }
    window.addEventListener('storage', syncSession)
    return () => window.removeEventListener('storage', syncSession)
  }, [onStorageSessionChange])

  const contextValue: AuthContextValue = value
    ? { ...defaultContextValue, ...value }
    : { session, setSession, clearSession }

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
