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

  it('deduplicates concurrent unauthorized events for the same token', async () => {
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

    await Promise.allSettled([
      apiRequest('/first', { token: 'parallel-expired' }),
      apiRequest('/second', { token: 'parallel-expired' }),
    ])

    window.removeEventListener(API_UNAUTHORIZED_EVENT, listener)
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('apiRequest JSON integrity', () => {
  it('rejects nested non-finite numbers before fetch can stringify them as null', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(
      apiRequest('/runs', {
        method: 'POST',
        body: { process: { flow: Number.POSITIVE_INFINITY } },
      }),
    ).rejects.toThrow(/finite/i)
    expect(fetch).not.toHaveBeenCalled()
  })
})
