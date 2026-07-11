import { describe, expect, it } from 'vitest'
import {
  availableStatusActions,
  isProcessReadOnly,
  isResultsReadOnly,
  statusBadgeVariant,
} from './status-logic'

describe('v2 status logic', () => {
  it.each([
    ['draft', true, false, ['submit', 'invalidate']],
    ['submitted', true, false, ['lock', 'returnToDraft', 'invalidate']],
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

  it.each(['draft', 'submitted', 'locked', 'invalid'] as const)(
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
    expect(isProcessReadOnly('submitted', true)).toBe(false)
  })

  it('keeps results editable when locked and locks them when invalid', () => {
    expect(isResultsReadOnly('locked', true)).toBe(false)
    expect(isResultsReadOnly('invalid', true)).toBe(true)
    expect(isResultsReadOnly('submitted', true)).toBe(false)
  })

  it('maps every status to an existing badge variant', () => {
    expect(['secondary', 'outline', 'default', 'destructive']).toEqual(
      (['draft', 'submitted', 'locked', 'invalid'] as const).map(
        statusBadgeVariant,
      ),
    )
  })
})
