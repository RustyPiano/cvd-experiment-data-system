import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  AuthProvider,
  SESSION_STORAGE_KEY,
  createSessionSnapshot,
  useAuth,
} from './auth-store'

const user = {
  id: 'user-1',
  email: 'member@example.com',
  name: 'Member',
  role: 'member' as const,
  is_active: true,
  last_login_at: null,
}

function SessionProbe() {
  const { session, setSession } = useAuth()
  return (
    <>
      <output>{session.accessToken ?? 'signed-out'}</output>
      <button
        type="button"
        onClick={() => setSession(createSessionSnapshot('local-token', user))}
      >
        sign in
      </button>
    </>
  )
}

describe('AuthProvider storage synchronization', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  }

  beforeEach(() => {
    values.clear()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: storage,
    })
  })

  it('clears the in-memory session when another tab removes storage', () => {
    const onStorageSessionChange = vi.fn()
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ accessToken: 'old-token', currentUser: user }),
    )
    render(
      <AuthProvider onStorageSessionChange={onStorageSessionChange}>
        <SessionProbe />
      </AuthProvider>,
    )

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_STORAGE_KEY,
          newValue: null,
        }),
      )
    })

    expect(screen.getByText('signed-out')).toBeInTheDocument()
    expect(onStorageSessionChange).toHaveBeenCalledWith(
      createSessionSnapshot(null),
    )
  })

  it('adopts another tab session without writing it back', () => {
    const onStorageSessionChange = vi.fn()
    const stored = JSON.stringify({
      accessToken: 'remote-token',
      currentUser: user,
    })
    render(
      <AuthProvider onStorageSessionChange={onStorageSessionChange}>
        <SessionProbe />
      </AuthProvider>,
    )
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SESSION_STORAGE_KEY,
          newValue: stored,
        }),
      )
    })

    expect(screen.getByText('remote-token')).toBeInTheDocument()
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(onStorageSessionChange).toHaveBeenCalledWith(
      createSessionSnapshot('remote-token', user),
    )
  })
})
