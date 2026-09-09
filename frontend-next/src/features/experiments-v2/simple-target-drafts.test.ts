import { describe, expect, it } from 'vitest'

import { switchTargetDraft } from './simple-preparation-editors'
import type { SimpleTarget, TargetDrafts } from './simple-preparation-editors'

describe('simple target drafts', () => {
  it('restores dopant input after switching structure forms and back', () => {
    const doped: SimpleTarget = {
      architecture_type: 'single_region',
      material_regions: [
        {
          region_key: 'film',
          formula: 'MoS2',
          spatial_role: 'single_region',
        },
      ],
      composition_relations: [
        {
          relation_type: 'doped_by',
          host_region_key: 'film',
          species: 'Pt',
          nominal_value: 1,
          value_basis: 'at_percent',
          site_or_location: 'Mo_site',
        },
      ],
    }
    const [alloy, drafts] = switchTargetDraft(
      doped,
      'vertical',
      {} satisfies TargetDrafts,
    )
    const [restored] = switchTargetDraft(alloy, 'single', drafts)

    expect(alloy.material_regions).toHaveLength(2)
    expect(alloy.composition_relations).toEqual(doped.composition_relations)
    expect(restored).toEqual(doped)
  })
})
