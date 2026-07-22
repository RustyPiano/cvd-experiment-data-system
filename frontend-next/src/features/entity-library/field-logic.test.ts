import { describe, expect, it } from 'vitest'
import { entities, experimentModules } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import {
  SYSTEM_FIELD_KEYS,
  buildDefaultValues,
  buildSubmitPayload,
  getEntityFields,
  isEffectivelyRequired,
  isFieldVisible,
  isNoneOption,
  isOtherOptionMarker,
  isSelectWithOtherInput,
  parseEnumOptions,
  resolveConditionKey,
} from './field-logic'
import type { EntityFormValues } from './field-logic'

function field(kind: 'material_lot' | 'setup' | 'instrument', key: string) {
  return entities[kind].find((f) => f.key === key) as FieldMetadata
}

describe('parseEnumOptions', () => {
  it('parses every generated dropdown or multi-select field', () => {
    const fields = [
      ...Object.values(experimentModules).flat(),
      ...Object.values(entities).flat(),
    ].filter((item) => /(下拉|多选)/.test(item.input))

    expect(fields.length).toBeGreaterThan(0)
    for (const item of fields) {
      expect(
        parseEnumOptions(item.input, item.options),
        item.key,
      ).not.toBeNull()
      expect(
        parseEnumOptions(item.input, item.options)?.length,
        item.key,
      ).toBeGreaterThan(0)
    }
  })

  it.each([
    ['target_morphology', 'nanoflake'],
    ['appearance', 'caked_or_deliquescent'],
    ['material', 'sapphire_al2o3'],
    ['event_part', 'other_addable'],
  ])('keeps the real %s option %s', (key, option) => {
    const item = Object.values(experimentModules)
      .flat()
      .find((candidate) => candidate.key === key)!
    expect(parseEnumOptions(item.input, item.options)).toContain(option)
  })

  it('treats non-enum input as free text regardless of option prose', () => {
    expect(parseEnumOptions('文本', '化学品/衬底/气瓶')).toBeNull()
    expect(parseEnumOptions('文本', '受控+其他')).toBeNull()
    expect(parseEnumOptions('下拉', null)).toBeNull()
  })

  it('recognizes select-with-other metadata markers', () => {
    expect(isSelectWithOtherInput('下拉+其他')).toBe(true)
    expect(isSelectWithOtherInput('下拉')).toBe(false)
    expect(isOtherOptionMarker('受控+其他')).toBe(true)
    expect(isOtherOptionMarker('其他')).toBe(true)
    expect(isOtherOptionMarker('CVD')).toBe(false)
    expect(isNoneOption('无')).toBe(true)
  })
})

describe('getEntityFields', () => {
  it('drops the system-managed version field from editable form fields', () => {
    expect(SYSTEM_FIELD_KEYS.has('version')).toBe(true)
    const keys = getEntityFields('material_lot').map((f) => f.key)
    expect(keys).not.toContain('version')
    // material_lot has 22 registered fields incl. version → 21 editable
    expect(keys).toContain('lot_category')
    expect(keys).toContain('substance_name')
  })
})

describe('resolveConditionKey', () => {
  it('maps a labelZh-referenced condition to its field key', () => {
    expect(resolveConditionKey('material_lot', 'MaterialLot.批次类别')).toBe(
      'lot_category',
    )
    expect(resolveConditionKey('material_lot', 'MaterialLot.▸衬底·材料')).toBe(
      'substrate_material',
    )
  })
})

describe('material_lot conditional visibility (▸衬底 / ▸气瓶 by lot_category)', () => {
  const base: EntityFormValues = {}

  it('hides all substrate/gas sub-fields until a category is chosen', () => {
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'substrate_material'),
        base,
      ),
    ).toBe(false)
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'substrate_orientation_polish'),
        base,
      ),
    ).toBe(false)
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'gas_purity_grade'),
        base,
      ),
    ).toBe(false)
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'gas_cylinder_number'),
        base,
      ),
    ).toBe(false)
  })

  it('shows only substrate sub-fields when lot_category = 衬底', () => {
    const values: EntityFormValues = { lot_category: '衬底' }
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'substrate_material'),
        values,
      ),
    ).toBe(true)
    // ▸衬底 sub-field without an explicit condition is still gated by the group
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'substrate_orientation_polish'),
        values,
      ),
    ).toBe(true)
    // ▸气瓶 group hidden
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'gas_purity_grade'),
        values,
      ),
    ).toBe(false)
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'gas_cylinder_number'),
        values,
      ),
    ).toBe(false)
  })

  it('shows only gas sub-fields when lot_category = 气瓶', () => {
    const values: EntityFormValues = { lot_category: '气瓶' }
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'gas_purity_grade'),
        values,
      ),
    ).toBe(true)
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'gas_cylinder_number'),
        values,
      ),
    ).toBe(true)
    expect(
      isFieldVisible(
        'material_lot',
        field('material_lot', 'substrate_material'),
        values,
      ),
    ).toBe(false)
  })

  it('nests oxide thickness under substrate_material = SiO₂/Si', () => {
    const oxide = field('material_lot', 'substrate_oxide_thickness_nm')
    expect(
      isFieldVisible('material_lot', oxide, {
        lot_category: '衬底',
        substrate_material: '蓝宝石',
      }),
    ).toBe(false)
    expect(
      isFieldVisible('material_lot', oxide, {
        lot_category: '衬底',
        substrate_material: 'SiO₂/Si',
      }),
    ).toBe(true)
    // even matching substrate_material can't show it when the group is 气瓶
    expect(
      isFieldVisible('material_lot', oxide, {
        lot_category: '气瓶',
        substrate_material: 'SiO₂/Si',
      }),
    ).toBe(false)
  })
})

describe('effective required-ness', () => {
  it('keeps plain required fields required regardless of values', () => {
    expect(
      isEffectivelyRequired(
        'material_lot',
        field('material_lot', 'lot_category'),
        {},
      ),
    ).toBe(true)
    expect(
      isEffectivelyRequired(
        'material_lot',
        field('material_lot', 'substance_name'),
        {},
      ),
    ).toBe(true)
  })

  it('makes a conditional_required field required only when its condition holds', () => {
    const substrate = field('material_lot', 'substrate_material')
    expect(isEffectivelyRequired('material_lot', substrate, {})).toBe(false)
    expect(
      isEffectivelyRequired('material_lot', substrate, {
        lot_category: '衬底',
      }),
    ).toBe(true)
  })
})

describe('buildSubmitPayload', () => {
  it('keeps only visible non-empty fields (drops stale hidden values)', () => {
    const values: EntityFormValues = {
      lot_category: '衬底',
      substance_name: 'MoO₃',
      substrate_material: 'SiO₂/Si',
      // stale value from a prior 气瓶 selection — must not leak into the payload
      gas_purity_grade: '6N',
    }
    const payload = buildSubmitPayload('material_lot', values)
    expect(payload.lot_category).toBe('substrate')
    expect(payload.substance_name).toBe('MoO₃')
    expect(payload.substrate_material).toBe('sio2_si')
    expect(payload).not.toHaveProperty('gas_purity_grade')
  })

  it('preserves multi-select values as canonical arrays across edit and submit', () => {
    const defaults = buildDefaultValues('setup', {
      field_devices: ['光', '电'],
    })
    expect(defaults.field_devices).toEqual(['light', 'electric_field'])

    const payload = buildSubmitPayload('setup', {
      field_devices: [' 光 ', '电', '光'],
    })
    expect(payload.field_devices).toEqual(['light', 'electric_field'])
  })

  it('round-trips composite entity fields as structured values', () => {
    const defaults = buildDefaultValues('setup', {
      tube_outer_diameter_wall_mm: { value: 2, option: '2″' },
    })
    expect(defaults.tube_outer_diameter_wall_mm).toBe('2″；2')

    const payload = buildSubmitPayload('setup', {
      setup_code: 'CVD-01',
      setup_name: 'Tube furnace',
      zone_count: '3',
      orientation: 'horizontal',
      tube_outer_diameter_wall_mm: defaults.tube_outer_diameter_wall_mm,
    })
    expect(payload.tube_outer_diameter_wall_mm).toEqual({
      value: 2,
      option: 'tube_2_inch',
    })
    expect(payload.zone_count).toBe(3)
  })
})
