import { describe, expect, it } from 'vitest'
import {
  availableStatusActions,
  isProcessReadOnly,
  isResultsReadOnly,
  statusBadgeVariant,
} from './status-logic'

describe('v2 status logic', () => {
  it.each([
    ['draft', false, ['submit', 'invalidate']],
    ['submitted', false, ['lock', 'returnToDraft', 'invalidate']],
    ['locked', false, []],
    ['locked', true, ['unlock']],
    ['invalid', true, []],
  ] as const)('%s admin=%s exposes allowed actions', (status, isAdmin, expected) => {
    expect(availableStatusActions(status, isAdmin)).toEqual(expected)
  })

  it('locks process controls for locked and invalid runs', () => {
    expect(isProcessReadOnly('locked')).toBe(true)
    expect(isProcessReadOnly('invalid')).toBe(true)
    expect(isProcessReadOnly('submitted')).toBe(false)
  })

  it('keeps results editable when locked and locks them when invalid', () => {
    expect(isResultsReadOnly('locked')).toBe(false)
    expect(isResultsReadOnly('invalid')).toBe(true)
    expect(isResultsReadOnly('submitted')).toBe(false)
  })

  it('maps every status to an existing badge variant', () => {
    expect(['secondary', 'outline', 'default', 'destructive']).toEqual(
      (['draft', 'submitted', 'locked', 'invalid'] as const).map(statusBadgeVariant),
    )
  })
})
