import { describe, expect, it } from 'vitest'

import { toIsoDateTime } from './datetime'

describe('experiment wall-clock datetime', () => {
  it.each(['2026-07-11T23:55', '2026-07-12T00:05'])(
    'round-trips %s without crossing dates',
    (local) => {
      const stored = toIsoDateTime(local)

      expect(stored).toMatch(new RegExp(`^${local}:00[+-]\\d{2}:\\d{2}$`))
    },
  )

  it('keeps invalid submit input unchanged', () => {
    expect(toIsoDateTime('not-a-datetime')).toBe('not-a-datetime')
  })
})
