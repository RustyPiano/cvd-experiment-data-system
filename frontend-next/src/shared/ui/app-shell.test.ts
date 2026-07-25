import { describe, expect, it } from 'vitest'

import { primaryNavItems } from './app-shell'

describe('primary navigation', () => {
  it('keeps preparation and characterization records as parallel entries', () => {
    expect(
      primaryNavItems.map(({ to, labelKey }) => ({ to, labelKey })),
    ).toEqual([
      { to: '/experiments', labelKey: 'experimentsV2.nav' },
      { to: '/characterizations', labelKey: 'characterizations.nav' },
    ])
  })
})
