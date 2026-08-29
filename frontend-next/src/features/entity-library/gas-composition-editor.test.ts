import { describe, expect, it } from 'vitest'

import {
  gasCompositionIssue,
  gasCompositionSummary,
} from './gas-composition-editor'

describe('gas composition', () => {
  it('accepts pure and premixed cylinders and rejects invalid totals', () => {
    expect(
      gasCompositionIssue([{ species: 'Ar', volume_percent: 100 }]),
    ).toBeNull()
    expect(
      gasCompositionIssue([
        { species: 'H2', volume_percent: 5 },
        { species: 'Ar', volume_percent: 95 },
      ]),
    ).toBeNull()
    expect(
      gasCompositionIssue([
        { species: 'H2', volume_percent: 5 },
        { species: 'Ar', volume_percent: 90 },
      ]),
    ).toBe('total')
    expect(
      gasCompositionIssue([
        { species: 'H2', volume_percent: 50 },
        { species: 'Ar', volume_percent: 49.99 },
      ]),
    ).toBeNull()
    expect(
      gasCompositionIssue([
        { species: 'Ar', volume_percent: 50 },
        { species: 'Ar', volume_percent: 50 },
      ]),
    ).toBe('duplicate')
    expect(
      gasCompositionIssue([
        { species: 'other', other_name: 'Mix X', volume_percent: 50 },
        { species: 'other', other_name: 'mix x', volume_percent: 50 },
      ]),
    ).toBe('duplicate')
  })

  it('renders the frozen composition without inventing a formula', () => {
    expect(
      gasCompositionSummary([
        { species: 'H2', volume_percent: 5 },
        { species: 'Ar', volume_percent: 95 },
      ]),
    ).toBe('5 vol% H2 / 95 vol% Ar')
  })
})
