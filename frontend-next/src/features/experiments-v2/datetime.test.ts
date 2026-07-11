import { describe, expect, it } from 'vitest'

import { isoToDateTimeLocal, toIsoDateTime } from './datetime'

describe('experiment wall-clock datetime', () => {
  it.each(['2026-07-11T23:55', '2026-07-12T00:05'])(
    'round-trips %s without crossing dates',
    (local) => {
      const stored = toIsoDateTime(local)

      expect(stored).toBe(`${local}:00`)
      expect(isoToDateTimeLocal(stored)).toBe(local)
    },
  )

  it('converts a historical UTC value back through the browser local timezone', () => {
    const historical = '2026-07-11T16:05:00Z'
    const date = new Date(historical)
    const pad = (value: number) => String(value).padStart(2, '0')
    const expected =
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`

    expect(isoToDateTimeLocal(historical)).toBe(expected)
  })

  it('keeps invalid submit input unchanged', () => {
    expect(toIsoDateTime('not-a-datetime')).toBe('not-a-datetime')
  })
})
