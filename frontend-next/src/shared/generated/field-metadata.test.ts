import { describe, expect, it } from 'vitest'

import {
  entities,
  experimentModules,
  unitLabelsEn,
  optionLabelsZh,
  optionLabelsEn,
  optionCodes,
} from './field-metadata'

describe('generated field metadata', () => {
  it('exports the current released modules and fields', () => {
    expect(Object.keys(experimentModules)).toEqual([
      'basic_info',
      'target_product',
      'equipment',
      'precursors',
      'substrates',
      'process_steps',
      'process_events',
    ])
    expect(Object.values(experimentModules).flat()).toHaveLength(86)
    expect(Object.values(entities).flat()).toHaveLength(51)
    expect(optionLabelsZh.gas_exchange).toBe('气氛置换')
    expect(optionLabelsEn.gas_exchange).toBe('Atmosphere exchange')
    expect(optionCodes['气路置换']).toBe('gas_exchange')
  })

  it('publishes the current substrate and gas-cylinder fields', () => {
    const substrateKeys = experimentModules.substrates.map((field) => field.key)
    expect(substrateKeys).toEqual(
      expect.arrayContaining([
        'material',
        'chemical_formula',
        'crystal_orientation',
        'oxide_thickness_nm',
        'size_placement',
        'placement_relations',
      ]),
    )
    expect(
      experimentModules.substrates.find(
        (field) => field.key === 'placement_relations',
      )?.moduleLevel,
    ).toBe(true)
    expect(substrateKeys).not.toContain('miscut_angle_deg')
    expect(substrateKeys).not.toContain('surface_roughness')
    expect(entities.material_lot.map((field) => field.key)).toContain(
      'gas_components',
    )
  })

  it('keeps precursor amount conditional on non-gas-line loading', () => {
    const amount = experimentModules.precursors.find(
      (field) => field.key === 'amount',
    )
    expect(amount?.requirement).toMatchObject({
      level: 'conditional_required',
      condition: { field: '前驱体.装载方式', op: 'ne', value: '气路供给' },
    })
    expect(amount?.r0).toBe(true)
  })

  it('keeps the R0 set and generated unit translations stable', () => {
    expect(
      Object.values(experimentModules)
        .flat()
        .filter((field) => field.r0),
    ).toHaveLength(26)
    expect(unitLabelsEn['按指标']).toBe('per metric')
  })

  it('publishes only the remaining scalar-plus-option entity field', () => {
    const compositeInputs = new Set([
      '数值+下拉',
      '下拉+数值',
      '文本+下拉',
      '下拉+文本',
      '文本+数值',
    ])
    expect(
      [...Object.values(experimentModules), ...Object.values(entities)]
        .flat()
        .filter((field) => compositeInputs.has(field.input))
        .map((field) => field.key),
    ).toEqual(['substrate_orientation_polish'])
  })
})
