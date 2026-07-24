import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { sessionRefreshDelay, useSessionRefresh } from './use-session-refresh'

const api = vi.hoisted(() => ({ refreshSession: vi.fn() }))
const auth = vi.hoisted(() => ({ setSession: vi.fn() }))
const jwt = vi.hoisted(() => ({ decodeJwtExpMs: vi.fn() }))

vi.mock('./api', () => api)
vi.mock('./auth-store', () => ({
  createSessionSnapshot: vi.fn((accessToken, user) => ({ accessToken, user })),
  useAuth: () => ({
    session: { accessToken: 'token' },
    setSession: auth.setSession,
  }),
}))
vi.mock('@/shared/lib/jwt', () => jwt)

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('sessionRefreshDelay', () => {
  it('avoids an immediate refresh loop for short-lived tokens', () => {
    const now = 1_000_000

    expect(sessionRefreshDelay(now + 60 * 60 * 1000, now)).toBe(55 * 60 * 1000)
    expect(sessionRefreshDelay(now + 4 * 60 * 1000, now)).toBe(2 * 60 * 1000)
    expect(sessionRefreshDelay(now - 1, now)).toBe(0)
  })
})

describe('useSessionRefresh retry', () => {
  it('schedules another refresh after a transient network failure', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-24T00:00:00Z'))
    jwt.decodeJwtExpMs.mockReturnValue(Date.now() + 60 * 60 * 1000)
    api.refreshSession.mockRejectedValue(new TypeError('offline'))

    const { unmount } = renderHook(() => useSessionRefresh())
    await vi.advanceTimersByTimeAsync(55 * 60 * 1000)
    expect(api.refreshSession).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30 * 1000)
    expect(api.refreshSession).toHaveBeenCalledTimes(2)
    unmount()
  })
})
