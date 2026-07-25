import { describe, expect, it } from 'vitest'

import {
  materialLotAutofill,
  materialLotMatchesItem,
} from './repeatable-items-section'

describe('materialLotAutofill', () => {
  it('fills precursor identity from flat and nested frozen lot fields', () => {
    expect(
      materialLotAutofill('precursors', {
        chemical_formula: 'MoO3',
        attrs: {
          cas_number: '1313-27-5',
          inchikey_cid: 'JKQOBWVOAYFWKG-UHFFFAOYSA-N',
          form_appearance: 'powder',
        },
      }),
    ).toEqual({
      name_formula: 'MoO3',
      cas_inchi: '1313-27-5 · JKQOBWVOAYFWKG-UHFFFAOYSA-N',
      phase_state: 'solid',
    })
  })

  it('fills only substrate identity values that the frozen lot determines', () => {
    expect(
      materialLotAutofill('substrates', {
        chemical_formula: 'SiO2/Si',
        attrs: {
          substrate_material: 'sio2_si',
          substrate_oxide_thickness_nm: 285,
          substrate_orientation_polish: {
            value: '(100)',
            option: 'single_side_polished',
          },
        },
      }),
    ).toEqual({
      material: 'sio2_si',
      chemical_formula: 'SiO2/Si',
      crystal_orientation: '(100)',
      oxide_thickness_nm: '285',
    })
  })
})

describe('materialLotMatchesItem', () => {
  const lot = (lot_category: string) => ({ lot_category })

  it('selects gas cylinders only for gas-phase precursors', () => {
    expect(
      materialLotMatchesItem(
        'precursors',
        { phase_state: 'gas' },
        lot('gas_cylinder'),
      ),
    ).toBe(true)
    expect(
      materialLotMatchesItem(
        'precursors',
        { phase_state: '气' },
        lot('chemical'),
      ),
    ).toBe(false)
  })

  it('selects chemical lots for every non-gas precursor phase', () => {
    for (const phase_state of ['solid', 'liquid', '']) {
      expect(
        materialLotMatchesItem('precursors', { phase_state }, lot('chemical')),
      ).toBe(true)
      expect(
        materialLotMatchesItem(
          'precursors',
          { phase_state },
          lot('gas_cylinder'),
        ),
      ).toBe(false)
    }
  })

  it('selects substrate lots for substrate records', () => {
    expect(materialLotMatchesItem('substrates', {}, lot('substrate'))).toBe(
      true,
    )
    expect(materialLotMatchesItem('substrates', {}, lot('chemical'))).toBe(
      false,
    )
  })
})
