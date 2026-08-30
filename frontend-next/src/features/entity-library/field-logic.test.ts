import { describe, expect, it } from 'vitest'
import { entities } from '@/shared/generated/field-metadata'
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
  materialLotFormulaIsCompatible,
  matchesCondition,
  parseEnumOptions,
  resolveConditionKey,
} from './field-logic'
import type { EntityFormValues } from './field-logic'

function field(kind: 'material_lot' | 'setup' | 'instrument', key: string) {
  return entities[kind].find((f) => f.key === key) as FieldMetadata
}

describe('parseEnumOptions', () => {
  it('parses every generated dropdown or multi-select field', () => {
    const fields = Object.values(entities)
      .flat()
      .filter(
        (item) =>
          /(下拉|多选)/.test(item.input) &&
          parseEnumOptions(item.input, item.options, item.key),
      )

    expect(fields.length).toBeGreaterThan(0)
    for (const item of fields) {
      expect(
        parseEnumOptions(item.input, item.options, item.key),
        item.key,
      ).not.toBeNull()
      expect(
        parseEnumOptions(item.input, item.options, item.key)?.length,
        item.key,
      ).toBeGreaterThan(0)
    }
  })

  it.each([
    ['lot_category', 'gas_cylinder'],
    ['substrate_material', 'sapphire_al2o3'],
    ['field_devices', 'light'],
  ])('keeps the real %s option %s', (key, option) => {
    const item = Object.values(entities)
      .flat()
      .find((candidate) => candidate.key === key)!
    expect(parseEnumOptions(item.input, item.options, item.key)).toContain(
      option,
    )
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
    expect(keys).toContain('lot_category')
    expect(keys).toContain('substance_name')

    const setupKeys = getEntityFields('setup').map((f) => f.key)
    expect(setupKeys).not.toContain('component_bindings')
  })

  it('allows a real custom substrate material name instead of literal other', () => {
    expect(
      isSelectWithOtherInput(field('material_lot', 'substrate_material').input),
    ).toBe(true)
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

describe('matchesCondition', () => {
  it('matches boolean conditions against checkbox form strings', () => {
    const condition = {
      field: '过程事件.是否导致实验终止',
      op: 'eq' as const,
      value: true,
    }
    expect(matchesCondition(condition, 'true')).toBe(true)
    expect(matchesCondition(condition, 'false')).toBe(false)
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

  it('shows form only for applicable lot categories', () => {
    const form = field('material_lot', 'form_appearance')

    expect(
      isFieldVisible('material_lot', form, { lot_category: '化学品' }),
    ).toBe(true)
    expect(isFieldVisible('material_lot', form, { lot_category: '衬底' })).toBe(
      false,
    )
    expect(isFieldVisible('material_lot', form, { lot_category: '气瓶' })).toBe(
      false,
    )
  })
})

describe('setup conditional visibility', () => {
  it('shows sensor and dimension fields only after their drivers are set', () => {
    const sensors = field('setup', 'temperature_sensors')
    const dimensions = field('setup', 'tube_outer_diameter_wall_mm')

    expect(isFieldVisible('setup', sensors, {})).toBe(false)
    expect(isFieldVisible('setup', sensors, { zone_count: '2' })).toBe(true)
    expect(isFieldVisible('setup', dimensions, {})).toBe(false)
    expect(
      isFieldVisible('setup', dimensions, {
        tube_material_shape: JSON.stringify({
          material: 'quartz',
          shape: 'round',
        }),
      }),
    ).toBe(true)
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

describe('material lot substrate formula', () => {
  it('hides generated identity fields and asks only when the formula is unknown', () => {
    const formula = field('material_lot', 'chemical_formula')
    const name = field('material_lot', 'substance_name')

    expect(
      isFieldVisible('material_lot', name, {
        lot_category: 'substrate',
        substrate_material: 'sio2_si',
      }),
    ).toBe(false)
    expect(
      isFieldVisible('material_lot', formula, {
        lot_category: 'substrate',
        substrate_material: 'sio2_si',
      }),
    ).toBe(false)
    expect(
      isFieldVisible('material_lot', formula, {
        lot_category: 'substrate',
        substrate_material: 'mica',
      }),
    ).toBe(true)
  })

  it('uses the derived formula for known materials and keeps custom materials open', () => {
    expect(
      materialLotFormulaIsCompatible({
        lot_category: '衬底',
        substrate_material: '蓝宝石',
        chemical_formula: 'MoS2',
      }),
    ).toBe(true)
    expect(
      materialLotFormulaIsCompatible({
        lot_category: 'substrate',
        substrate_material: 'sapphire_al2o3',
        chemical_formula: 'Al₂O₃',
      }),
    ).toBe(true)
    expect(
      materialLotFormulaIsCompatible({
        lot_category: 'substrate',
        substrate_material: 'custom substrate',
        chemical_formula: 'MoS2',
      }),
    ).toBe(true)
  })
})

describe('buildSubmitPayload', () => {
  it('drops identity fields from setup source branches that are not selected', () => {
    expect(
      buildSubmitPayload('setup', {
        setup_origin: 'lab_built',
        manufacturer_brand: 'stale manufacturer',
        model: 'stale model',
        design_build_organization: '二维材料课题组',
        internal_model: 'CVD-LAB-A',
        modification_details: 'stale modification',
      }),
    ).toEqual({
      setup_origin: 'lab_built',
      design_build_organization: '二维材料课题组',
      internal_model: 'CVD-LAB-A',
    })
  })

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
    expect(payload.substance_name).toBe('SiO₂/Si')
    expect(payload.chemical_formula).toBe('SiO2')
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

  it('round-trips named tube dimensions and backfills the legacy shape', () => {
    const defaults = buildDefaultValues('setup', {
      tube_outer_diameter_wall_mm: { value: 2, option: '2″' },
    })
    expect(JSON.parse(defaults.tube_outer_diameter_wall_mm as string)).toEqual({
      outer_diameter_mm: 50.8,
      wall_thickness_mm: 2,
    })

    const payload = buildSubmitPayload('setup', {
      setup_code: 'CVD-01',
      setup_name: 'Tube furnace',
      zone_count: '3',
      orientation: 'horizontal',
      tube_material_shape: JSON.stringify({
        material: 'quartz',
        shape: 'round',
      }),
      tube_outer_diameter_wall_mm: defaults.tube_outer_diameter_wall_mm,
    })
    expect(payload.tube_outer_diameter_wall_mm).toEqual({
      outer_diameter_mm: 50.8,
      wall_thickness_mm: 2,
    })
    expect(payload.zone_count).toBe(3)
  })

  it('round-trips structured temperature sensors', () => {
    const defaults = buildDefaultValues('setup', {
      temperature_sensors: [
        {
          sensor_type: 'thermocouple',
          zone_index: 1,
          nominal_accuracy_C: 1.5,
        },
      ],
    })
    expect(JSON.parse(defaults.temperature_sensors as string)).toEqual([
      {
        sensor_type: 'thermocouple',
        zone_index: 1,
        nominal_accuracy_C: 1.5,
      },
    ])
    expect(
      buildSubmitPayload('setup', {
        zone_count: '1',
        temperature_sensors: defaults.temperature_sensors,
      }),
    ).toEqual({
      zone_count: 1,
      temperature_sensors: [
        {
          sensor_type: 'thermocouple',
          zone_index: 1,
          nominal_accuracy_C: 1.5,
        },
      ],
    })
  })

  it('submits instrument capabilities as a JSON array', () => {
    const capabilities = JSON.stringify([
      { code: 'Raman', configuration: { wavelength_nm: 532 } },
    ])

    expect(
      buildSubmitPayload('instrument', {
        instrument_code: 'RAMAN-1',
        name_type: 'Raman',
        capabilities,
      }),
    ).toEqual({
      instrument_code: 'RAMAN-1',
      name_type: 'Raman',
      capabilities: [{ code: 'Raman', configuration: { wavelength_nm: 532 } }],
    })
  })

  it('round-trips enriched file references without leaking display metadata', () => {
    const defaults = buildDefaultValues('material_lot', {
      coa_attachment: {
        file_asset_id: 'file-1',
        sha256: 'abc123',
        original_name: 'coa.pdf',
        size_bytes: 2048,
      },
    })
    expect(JSON.parse(defaults.coa_attachment as string)).toEqual({
      file_asset_id: 'file-1',
      sha256: 'abc123',
      original_name: 'coa.pdf',
      size_bytes: 2048,
    })

    expect(
      buildSubmitPayload('material_lot', {
        lot_category: 'chemical',
        coa_attachment: defaults.coa_attachment,
      }),
    ).toEqual({
      lot_category: 'chemical',
      coa_attachment: {
        file_asset_id: 'file-1',
        sha256: 'abc123',
      },
    })
  })

  it('rejects malformed file references instead of submitting text or JSON guesses', () => {
    expect(() =>
      buildSubmitPayload('setup', {
        setup_diagram: '{"file_asset_id":"file-1"}',
      }),
    ).toThrowError(/setup_diagram.*file reference/)
  })

  it('rejects non-finite and out-of-range numeric entity values', () => {
    expect(() =>
      buildSubmitPayload('setup', {
        zone_count: '0',
      }),
    ).toThrowError(/zone_count.*ge/)
    expect(() =>
      buildSubmitPayload('setup', {
        zone_count: '2.5',
      }),
    ).toThrowError(/zone_count.*integer/)
  })
})
