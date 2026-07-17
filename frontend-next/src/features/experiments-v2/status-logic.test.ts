import { describe, expect, it } from 'vitest'
import {
  availableStatusActions,
  isProcessReadOnly,
  isResultsReadOnly,
  statusBadgeVariant,
  statusTransitionInvalidationKeys,
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

  it('refreshes generated samples after a status transition', () => {
    expect(statusTransitionInvalidationKeys('run-1', 'token')).toContainEqual([
      'v2-samples',
      'run-1',
      'token',
    ])
  })
})
