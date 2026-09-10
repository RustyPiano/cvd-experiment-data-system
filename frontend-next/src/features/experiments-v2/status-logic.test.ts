import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  availableStatusActions,
  isProcessReadOnly,
  isResultsReadOnly,
  statusBadgeVariant,
  invalidateRunQueries,
} from './status-logic'

describe('v2 status logic', () => {
  it.each([
    ['draft', true, false, ['lock', 'invalidate']],
    ['locked', true, false, []],
    ['locked', true, true, ['unlock']],
    ['invalid', true, true, []],
  ] as const)(
    '%s writable=%s admin=%s exposes allowed actions',
    (status, canWrite, isAdmin, expected) => {
      expect(availableStatusActions(status, canWrite, isAdmin)).toEqual(
        expected,
      )
    },
  )

  it.each(['draft', 'locked', 'invalid'] as const)(
    'hides every write entry for a non-owner in %s',
    (status) => {
      expect(availableStatusActions(status, false, false)).toEqual([])
      expect(isProcessReadOnly(status, false)).toBe(true)
      expect(isResultsReadOnly(status, false)).toBe(true)
    },
  )

  it('locks process controls for locked and invalid runs', () => {
    expect(isProcessReadOnly('locked', true)).toBe(true)
    expect(isProcessReadOnly('invalid', true)).toBe(true)
    expect(isProcessReadOnly('draft', true)).toBe(false)
  })

  it('keeps results editable when locked and locks them when invalid', () => {
    expect(isResultsReadOnly('locked', true)).toBe(false)
    expect(isResultsReadOnly('invalid', true)).toBe(true)
    expect(isResultsReadOnly('draft', true)).toBe(false)
  })

  it('maps every status to an existing badge variant', () => {
    expect(['secondary', 'default', 'destructive']).toEqual(
      (['draft', 'locked', 'invalid'] as const).map(statusBadgeVariant),
    )
  })

  it('invalidates fresh caches consumed by every affected page', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000 } },
    })
    const keys = [
      ['samples', 'list', 'user'],
      ['samples', 'detail', 'user', 's1'],
      ['samples', 'run-1'],
      ['measurements', 'run-1'],
      ['measurements', 'sample', 'user', 's1'],
      ['measurement-detail', 'm1'],
      ['characterizations', 'list', 'user'],
      ['v2-experiment-list', 'token', 1, {}],
      ['v2-experiment', 'run-1', 'token'],
      ['experiments', 'detail', 'user', 'run-1'],
      ['v2-experiment-status', 'run-1'],
      ['v2-experiment-status', 'run-1', 'token'],
      ['v2-run-audit', 'run-1', 'token'],
      ['v2-run-revisions', 'run-1', 'token'],
    ]
    for (const key of keys) client.setQueryData(key, { old: true })
    client.setQueryData(['v2-entity', 'instrument'], { unchanged: true })
    await invalidateRunQueries(client, 'run-1')
    for (const key of keys)
      expect(
        client.getQueryState(key)?.isInvalidated,
        JSON.stringify(key),
      ).toBe(true)
    expect(
      client.getQueryState(['v2-entity', 'instrument'])?.isInvalidated,
    ).toBe(false)
    client.clear()
  })
})
