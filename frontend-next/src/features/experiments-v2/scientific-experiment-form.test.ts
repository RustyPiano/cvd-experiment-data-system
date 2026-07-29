import { describe, expect, it } from 'vitest'

import { tubeUsageParts } from './scientific-form-workflow'

describe('scientific experiment workflow helpers', () => {
  it('keeps the two tube-usage fields deterministic', () => {
    expect(tubeUsageParts(' 2, 7 ')).toEqual(['2', '7'])
  })
})
