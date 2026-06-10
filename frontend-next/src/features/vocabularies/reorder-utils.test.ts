import { describe, expect, it } from 'vitest'

import { moveInOrder } from './reorder-utils'

describe('moveInOrder', () => {
  it('moves an element up by one position', () => {
    expect(moveInOrder(['a', 'b', 'c'], 1, 'up')).toEqual(['b', 'a', 'c'])
  })

  it('moves an element down by one position', () => {
    expect(moveInOrder(['a', 'b', 'c'], 1, 'down')).toEqual(['a', 'c', 'b'])
  })

  it('returns the same reference (no-op) at the top boundary', () => {
    const items = ['a', 'b', 'c']
    expect(moveInOrder(items, 0, 'up')).toBe(items)
  })

  it('returns the same reference (no-op) at the bottom boundary', () => {
    const items = ['a', 'b', 'c']
    expect(moveInOrder(items, 2, 'down')).toBe(items)
  })

  it('returns the same reference for an out-of-range index', () => {
    const items = ['a', 'b', 'c']
    expect(moveInOrder(items, 5, 'up')).toBe(items)
  })

  it('does not mutate the input array', () => {
    const items = ['a', 'b', 'c']
    moveInOrder(items, 1, 'up')
    expect(items).toEqual(['a', 'b', 'c'])
  })
})
