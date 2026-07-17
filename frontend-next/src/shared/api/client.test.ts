import { afterEach, describe, expect, it, vi } from 'vitest'

import { API_UNAUTHORIZED_EVENT, apiRequest } from './client'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiRequest unauthorized handling', () => {
  it('can suppress the unauthorized event for an expected 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"detail":"Invalid token"}', {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const listener = vi.fn()
    window.addEventListener(API_UNAUTHORIZED_EVENT, listener)

    await expect(
      apiRequest('/logout', {
        token: 'expired',
        suppressUnauthorizedEvent: true,
      }),
    ).rejects.toMatchObject({ status: 401 })

    window.removeEventListener(API_UNAUTHORIZED_EVENT, listener)
    expect(listener).not.toHaveBeenCalled()
  })

  it('still dispatches the unauthorized event for ordinary authenticated requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"detail":"Invalid token"}', {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const listener = vi.fn()
    window.addEventListener(API_UNAUTHORIZED_EVENT, listener)

    await expect(apiRequest('/me', { token: 'expired' })).rejects.toMatchObject(
      { status: 401 },
    )

    window.removeEventListener(API_UNAUTHORIZED_EVENT, listener)
    expect(listener).toHaveBeenCalledOnce()
  })
})
