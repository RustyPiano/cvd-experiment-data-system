import { describe, expect, it } from 'vitest'
import {
  assertValidNumber,
  numericInputAttributes,
  numericValidationIssue,
} from './field-validation'

describe('numeric field validation', () => {
  it('distinguishes finite, integer, inclusive, and exclusive constraints', () => {
    expect(numericValidationIssue('1e309', null)).toEqual({ kind: 'finite' })
    expect(numericValidationIssue('1.5', { type: 'integer', ge: 1 })).toEqual({
      kind: 'integer',
    })
    expect(numericValidationIssue('-1', { ge: 0 })).toEqual({
      kind: 'ge',
      limit: 0,
    })
    expect(numericValidationIssue('0', { gt: 0 })).toEqual({
      kind: 'gt',
      limit: 0,
    })
    expect(numericValidationIssue('101', { le: 100 })).toEqual({
      kind: 'le',
      limit: 100,
    })
    expect(numericValidationIssue('10', { lt: 10 })).toEqual({
      kind: 'lt',
      limit: 10,
    })
  })

  it('exposes browser hints without weakening exclusive validation', () => {
    expect(numericInputAttributes({ type: 'integer', ge: 1, le: 12 })).toEqual({
      min: 1,
      max: 12,
      step: 1,
    })
    expect(numericInputAttributes({ gt: 0 })).toEqual({
      min: 0,
      max: undefined,
      step: 'any',
    })
  })

  it('returns a number only when all declared constraints hold', () => {
    expect(
      assertValidNumber('2', 'zone_count', { type: 'integer', ge: 1 }),
    ).toBe(2)
    expect(() => assertValidNumber('0', 'pressure', { gt: 0 })).toThrowError(
      /pressure.*gt/,
    )
  })
})
