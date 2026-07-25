import { describe, expect, it } from 'vitest'

import {
  applyMaterialLotSelection,
  materialLotAutofill,
  materialLotFieldIsProjected,
  materialLotMatchesItem,
  materialLotMissingStableFields,
  materialLotProjectedItem,
  materialLotReferenceFirst,
  updateMaterialLotAwareItem,
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
      orientation_polish_availability: 'reported',
      crystal_orientation: '(100)；single_side_polished',
      oxide_thickness_nm: '285',
    })
  })

  it('projects every stable substrate specification owned by a current lot', () => {
    expect(
      materialLotAutofill('substrates', {
        chemical_formula: 'Al2O3',
        attrs: {
          substrate_material: 'sapphire_al2o3',
          substrate_orientation_polish: {
            value: 'c-plane',
            option: 'single_side_polished',
          },
          substrate_miscut_angle_deg: 0.2,
          substrate_miscut_direction: 'toward_a_axis',
          substrate_surface_roughness: {
            availability: 'reported',
            metric: 'RMS',
            value_nm: 0.5,
          },
        },
      }),
    ).toEqual({
      material: 'sapphire_al2o3',
      chemical_formula: 'Al2O3',
      orientation_polish_availability: 'reported',
      crystal_orientation: 'c-plane；single_side_polished',
      miscut_availability: 'reported',
      miscut_angle_deg: '0.2',
      miscut_direction: 'toward_a_axis',
      surface_roughness:
        '{"availability":"reported","metric":"RMS","value_nm":0.5}',
    })
  })

  it('keeps old-lot gaps read-only and clears forged run fallbacks', () => {
    expect(
      materialLotFieldIsProjected('substrates', 'chemical_formula', {
        lot_ref: '',
      }),
    ).toBe(true)
    expect(
      materialLotFieldIsProjected('substrates', 'size_placement', {
        lot_ref: '',
      }),
    ).toBe(false)
    const selected = applyMaterialLotSelection(
      'substrates',
      {
        chemical_formula: 'STALE',
        crystal_orientation: 'user fallback',
        miscut_angle_deg: '1',
        lot_ref: '',
      },
      {
        chemical_formula: 'SiC',
        attrs: { substrate_material: 'other' },
      },
    )

    expect(selected).toMatchObject({
      material: 'other',
      chemical_formula: 'SiC',
      crystal_orientation: '',
      miscut_angle_deg: '',
    })
    const withReference = {
      ...selected,
      lot_ref: JSON.stringify({
        entity_id: 'lot-1',
        version: 1,
        snapshot: {
          chemical_formula: 'SiC',
          attrs: { substrate_material: 'other' },
        },
      }),
    }
    expect(
      materialLotFieldIsProjected(
        'substrates',
        'chemical_formula',
        withReference,
      ),
    ).toBe(true)
    expect(
      materialLotFieldIsProjected(
        'substrates',
        'crystal_orientation',
        withReference,
      ),
    ).toBe(true)
    expect(
      materialLotProjectedItem('substrates', {
        ...withReference,
        chemical_formula: 'stale saved value',
        crystal_orientation: 'forged run fallback',
      }).chemical_formula,
    ).toBe('SiC')
    expect(
      materialLotProjectedItem('substrates', {
        ...withReference,
        crystal_orientation: 'forged run fallback',
      }).crystal_orientation,
    ).toBe('')
    expect(
      materialLotMissingStableFields(
        'substrates',
        withReference.lot_ref ? JSON.parse(withReference.lot_ref).snapshot : {},
      ),
    ).toEqual([
      'orientation_polish_availability',
      'miscut_availability',
      'surface_roughness',
    ])
  })

  it('projects explicit not-applicable crystal specifications without fake values', () => {
    expect(
      materialLotAutofill('substrates', {
        chemical_formula: 'Cu',
        attrs: {
          substrate_material: 'cu_foil',
          substrate_orientation_polish_availability: 'not_applicable',
          substrate_miscut_availability: 'not_applicable',
          substrate_surface_roughness: { availability: 'not_provided' },
        },
      }),
    ).toEqual({
      material: 'cu_foil',
      chemical_formula: 'Cu',
      orientation_polish_availability: 'not_applicable',
      miscut_availability: 'not_applicable',
      surface_roughness: '{"availability":"not_provided"}',
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

  it('selects chemical lots for every known non-gas precursor phase', () => {
    for (const phase_state of ['solid', 'liquid']) {
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

  it('shows both precursor lot categories before phase is chosen', () => {
    expect(
      materialLotMatchesItem(
        'precursors',
        { phase_state: '' },
        lot('chemical'),
      ),
    ).toBe(true)
    expect(
      materialLotMatchesItem(
        'precursors',
        { phase_state: '' },
        lot('gas_cylinder'),
      ),
    ).toBe(true)
  })

  it('selects substrate lots for substrate records', () => {
    expect(materialLotMatchesItem('substrates', {}, lot('substrate'))).toBe(
      true,
    )
    expect(materialLotMatchesItem('substrates', {}, lot('chemical'))).toBe(
      false,
    )
  })

  it('clears a selected lot immediately when its discriminator becomes incompatible', () => {
    const lotRef = JSON.stringify({
      entity_id: 'lot-1',
      version: 1,
      snapshot: {
        lot_category: 'gas_cylinder',
        chemical_formula: 'Ar',
      },
    })

    expect(
      updateMaterialLotAwareItem(
        'precursors',
        {
          lot_ref: lotRef,
          phase_state: 'gas',
          name_formula: 'Ar',
          cas_inchi: '7440-37-1',
        },
        'phase_state',
        'solid',
      ),
    ).toEqual({
      lot_ref: '',
      phase_state: 'solid',
      name_formula: '',
      cas_inchi: '',
    })
  })

  it('places the lot reference before run-level fields without mutating metadata', () => {
    const fields = [{ key: 'phase_state' }, { key: 'lot_ref' }]
    expect(materialLotReferenceFirst(fields).map((field) => field.key)).toEqual(
      ['lot_ref', 'phase_state'],
    )
    expect(fields.map((field) => field.key)).toEqual(['phase_state', 'lot_ref'])
  })
})
