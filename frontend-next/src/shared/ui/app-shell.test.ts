import { describe, expect, it } from 'vitest'

import { primaryNavItems } from './app-shell'

describe('primary navigation', () => {
  it('shows only the three ordinary-user product entries', () => {
    expect(
      primaryNavItems.map(({ to, labelKey }) => ({ to, labelKey })),
    ).toEqual([
      { to: '/experiments', labelKey: 'experimentsV2.nav' },
      { to: '/characterizations', labelKey: 'characterizations.nav' },
      { to: '/samples', labelKey: 'samples.list.title' },
    ])
    expect(primaryNavItems.map(({ to }) => to)).not.toContain('/datasets')
  })
})
