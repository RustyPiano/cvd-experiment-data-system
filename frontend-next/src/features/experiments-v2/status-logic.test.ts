import { describe, expect, it } from 'vitest'
import { availableStatusActions, isRunReadOnly, statusBadgeVariant } from './status-logic'

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

  it('locks form controls only in terminal states', () => {
    expect(isRunReadOnly('locked')).toBe(true)
    expect(isRunReadOnly('invalid')).toBe(true)
    expect(isRunReadOnly('submitted')).toBe(false)
  })

  it('maps every status to an existing badge variant', () => {
    expect(['secondary', 'outline', 'default', 'destructive']).toEqual(
      (['draft', 'submitted', 'locked', 'invalid'] as const).map(statusBadgeVariant),
    )
  })
})
