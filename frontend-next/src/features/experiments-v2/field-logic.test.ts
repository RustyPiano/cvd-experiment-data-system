import { describe, expect, it } from 'vitest'
import { experimentModules } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import {
  buildFlatModulePayload,
  buildItemPayload,
  buildItemsModulePayload,
  buildProcessStepsPayload,
  buildTargetProductPayload,
  componentsFromPayload,
  emptyComponentRow,
  emptyModuleValues,
  getComponentRoleOptions,
  isEffectivelyRequired,
  isFieldVisible,
  isProcessStepFieldVisible,
  itemHasAnyValue,
  itemsFromPayload,
  moduleValueAsString,
  moduleValuesFromPayload,
  missingProcessStepKeys,
  missingRequiredKeys,
  parseComponentRoles,
  resolveModuleConditionKey,
} from './field-logic'

function field(moduleKey: string, key: string): FieldMetadata {
  return experimentModules[moduleKey].find(
    (f) => f.key === key,
  ) as FieldMetadata
}

describe('resolveModuleConditionKey', () => {
  it('maps intra-module labelZh references to field keys', () => {
    expect(
      resolveModuleConditionKey('target_product', '目标产物.结构类型'),
    ).toBe('structure_type')
    expect(resolveModuleConditionKey('precursors', '前驱体.相态')).toBe(
      'phase_state',
    )
    expect(resolveModuleConditionKey('substrates', '衬底.衬底材料')).toBe(
      'material',
    )
  })
})

describe('相态 → 用量 (phase_state drives amount required)', () => {
  const amount = field('precursors', 'amount')

  it('requires amount for non-gas phases', () => {
    expect(
      isEffectivelyRequired('precursors', amount, { phase_state: '固' }),
    ).toBe(true)
    expect(
      isEffectivelyRequired('precursors', amount, { phase_state: '液' }),
    ).toBe(true)
  })

  it('does not require amount for gas phase', () => {
    expect(
      isEffectivelyRequired('precursors', amount, { phase_state: '气' }),
    ).toBe(false)
  })

  it('does not require amount until phase is chosen', () => {
    expect(isEffectivelyRequired('precursors', amount, {})).toBe(false)
  })

  it('keeps amount always visible (only the red star toggles)', () => {
    expect(isFieldVisible('precursors', amount, { phase_state: '气' })).toBe(
      true,
    )
    expect(isFieldVisible('precursors', amount, {})).toBe(true)
  })
})

describe('相态 = 固 → 外观描述 (appearance shown for solids, recommended)', () => {
  const appearance = field('precursors', 'appearance')

  it('shows appearance only when phase = 固', () => {
    expect(
      isFieldVisible('precursors', appearance, { phase_state: '固' }),
    ).toBe(true)
    expect(
      isFieldVisible('precursors', appearance, { phase_state: '气' }),
    ).toBe(false)
    expect(isFieldVisible('precursors', appearance, {})).toBe(false)
  })

  it('never forces a red star on appearance (recommended)', () => {
    expect(
      isEffectivelyRequired('precursors', appearance, { phase_state: '固' }),
    ).toBe(false)
  })
})

describe('结构类型 → 组成明细 (structure_type drives components)', () => {
  const components = field('target_product', 'components')

  it('shows + requires components when structure_type ≠ 本征', () => {
    expect(
      isFieldVisible('target_product', components, { structure_type: '掺杂' }),
    ).toBe(true)
    expect(
      isEffectivelyRequired('target_product', components, {
        structure_type: '掺杂',
      }),
    ).toBe(true)
  })

  it('hides + drops components for 本征 or before a type is chosen', () => {
    expect(
      isFieldVisible('target_product', components, { structure_type: '本征' }),
    ).toBe(false)
    expect(isFieldVisible('target_product', components, {})).toBe(false)
    expect(
      isEffectivelyRequired('target_product', components, {
        structure_type: '本征',
      }),
    ).toBe(false)
  })
})

describe('衬底材料 = SiO₂/Si → 氧化层厚度 (oxide thickness)', () => {
  const oxide = field('substrates', 'oxide_thickness_nm')

  it('shows + requires oxide thickness only for SiO₂/Si', () => {
    expect(isFieldVisible('substrates', oxide, { material: 'SiO₂/Si' })).toBe(
      true,
    )
    expect(
      isEffectivelyRequired('substrates', oxide, { material: 'SiO₂/Si' }),
    ).toBe(true)
  })

  it('hides oxide thickness for other substrate materials', () => {
    expect(isFieldVisible('substrates', oxide, { material: '蓝宝石' })).toBe(
      false,
    )
    expect(isFieldVisible('substrates', oxide, {})).toBe(false)
    expect(
      isEffectivelyRequired('substrates', oxide, { material: '蓝宝石' }),
    ).toBe(false)
  })
})

describe('visibility metadata', () => {
  it.each([
    ['target_product', 'components'],
    ['precursors', 'appearance'],
    ['substrates', 'oxide_thickness_nm'],
  ])('marks %s.%s as visibility gated', (moduleKey, key) => {
    expect(field(moduleKey, key).visibilityGated).toBe(true)
  })
})

describe('parseComponentRoles', () => {
  it('extracts role enum from the components options string', () => {
    const components = field('target_product', 'components')
    expect(parseComponentRoles(components.options)).toEqual([
      'matrix',
      'dopant',
      'alloy_component',
      'top_layer',
      'bottom_layer',
      'lateral_domain',
    ])
    expect(getComponentRoleOptions()).toContain('dopant')
  })
})

describe('payload builders align with backend module contract', () => {
  it('flat module payload carries every field key (extra=forbid + required present)', () => {
    const payload = buildFlatModulePayload('basic_info', { started_at: 'x' })
    expect(Object.keys(payload).sort()).toEqual(
      experimentModules.basic_info.map((f) => f.key).sort(),
    )
    expect(payload.started_at).toBe('x')
    expect(payload.operator).toBeNull()
  })

  it('rejects numeric values outside generated metadata constraints', () => {
    expect(() =>
      buildFlatModulePayload('basic_info', {
        ambient_humidity_percent: '101',
      }),
    ).toThrowError(/ambient_humidity_percent.*le/)
    expect(() =>
      buildFlatModulePayload('target_product', {
        target_layer_count: '1.5',
      }),
    ).toThrowError(/target_layer_count.*integer/)
  })

  it('drops components for 本征 and includes them for composite systems', () => {
    const intrinsic = buildTargetProductPayload(
      { chemical_formula: 'MoS2', structure_type: '本征' },
      [{ ...emptyComponentRow(), formula: 'MoS2' }],
    )
    expect(intrinsic.components).toBeNull()
    expect(intrinsic.chemical_formula).toBe('MoS2')

    const composite = buildTargetProductPayload(
      { chemical_formula: 'x', structure_type: '垂直异质结' },
      [
        { ...emptyComponentRow(), formula: 'WSe2', layer_order: '2' },
        { ...emptyComponentRow(), formula: 'MoS2', layer_order: '1' },
      ],
    )
    expect(Array.isArray(composite.components)).toBe(true)
    expect((composite.components as unknown[]).length).toBe(2)
  })

  it('normalizes formulas, component roles, and component numbers on submit', () => {
    const payload = buildTargetProductPayload(
      { chemical_formula: ' Mo S₂ ', structure_type: '掺杂' },
      [
        {
          ...emptyComponentRow(),
          formula: ' Nb ',
          role: '掺杂剂',
          concentration_at_percent: '0.5',
          layer_order: '2',
        },
      ],
    )
    expect(payload.chemical_formula).toBe('MoS2')
    expect(payload.components).toEqual([
      {
        formula: 'Nb',
        role: 'dopant',
        concentration_at_percent: 0.5,
        layer_order: null,
      },
    ])
  })

  it('clears values that became hidden before serializing repeatable items', () => {
    expect(
      buildItemPayload('precursors', {
        phase_state: 'gas',
        appearance: 'stale solid appearance',
      }).appearance,
    ).toBeNull()
    expect(
      buildItemPayload('substrates', {
        material: 'sapphire',
        oxide_thickness_nm: '285',
      }).oxide_thickness_nm,
    ).toBeNull()
  })

  it('clears external-field values when the selected setup has no field device', () => {
    const payload = buildProcessStepsPayload(
      [
        {
          ...emptyModuleValues('process_steps'),
          stage_type: 'growth',
          pressure_system: 'atmospheric_pressure',
          field_params: 'stale magnetic field',
        },
      ],
      { field_devices: ['none'] },
    )

    expect(payload.items[0]?.field_params).toBeNull()
  })

  it('keeps only structure-applicable component measurements', () => {
    const vertical = buildTargetProductPayload(
      {
        chemical_formula: 'MoS2/WS2',
        structure_type: 'vertical_heterostructure',
      },
      [
        {
          formula: 'MoS2',
          role: 'bottom_layer',
          concentration_at_percent: '25',
          layer_order: '1',
        },
      ],
    )

    expect(vertical.components).toEqual([
      {
        formula: 'MoS2',
        role: 'bottom_layer',
        concentration_at_percent: null,
        layer_order: 1,
      },
    ])
  })

  it('rejects a non-finite numeric value instead of producing JSON null later', () => {
    expect(() =>
      buildFlatModulePayload('basic_info', {
        ambient_temperature_C: '1e309',
      }),
    ).toThrow(/finite/i)
  })

  it('round-trips every gas species without collapsing an array into one token', () => {
    const restored = moduleValuesFromPayload('process_steps', {
      gas_species: ['Ar', 'H₂'],
    })
    expect(restored.gas_species).toEqual(['Ar', 'H2'])
    const payload = buildItemPayload('process_steps', restored)
    expect(payload.gas_species).toEqual(['Ar', 'H2'])
  })

  it('canonicalizes legacy component roles when entering edit state', () => {
    expect(
      componentsFromPayload({
        components: [{ formula: 'MoS2', role: '基体' }],
      }),
    ).toEqual([expect.objectContaining({ formula: 'MoS2', role: 'matrix' })])
  })

  it('item payload carries every field key; empty rows are filtered out', () => {
    const item = buildItemPayload('precursors', {
      name_formula: 'MoO₃',
      phase_state: '固',
    })
    expect(item.name_formula).toBe('MoO₃')
    expect(item.phase_state).toBe('solid')
    expect('amount' in item).toBe(true)

    const module = buildItemsModulePayload('precursors', [
      { name_formula: 'MoO₃', phase_state: '固', amount: '5' },
      {},
    ])
    expect(module.items).toHaveLength(1)
  })

  it('stores process-event timestamps with an explicit offset and restores local input', () => {
    const local = '2026-07-11T23:55'
    const item = buildItemPayload('process_events', { occurred_at: local })

    expect(item.occurred_at).toEqual(
      expect.stringMatching(/^2026-07-11T23:55:00[+-]\d{2}:\d{2}$/),
    )
    expect(
      itemsFromPayload('process_events', { items: [item] })[0]?.occurred_at,
    ).toBe(local)
  })

  it('round-trips frozen material-lot references and named geometry objects', () => {
    const reference = {
      entity_id: '7d9e7787-e5ef-4f34-818f-454a10263a3b',
      version: 2,
      snapshot: { lot_code: 'LOT-2' },
    }
    const item = buildItemPayload('precursors', {
      lot_ref: JSON.stringify(reference),
      boat_crucible: JSON.stringify({
        material: 'quartz_boat',
        length_mm: '90',
      }),
      source_zone_temperature: JSON.stringify({
        zone_index: '1',
        temperature_C: '620',
      }),
    })

    expect(item.lot_ref).toEqual(reference)
    expect(item.boat_crucible).toEqual({
      material: 'quartz_boat',
      length_mm: 90,
      width_mm: null,
      height_mm: null,
      diameter_mm: null,
    })
    expect(item.source_zone_temperature).toEqual({
      zone_index: 1,
      temperature_C: 620,
    })
    expect(
      JSON.parse(
        moduleValueAsString(
          itemsFromPayload('precursors', { items: [item] })[0].lot_ref,
        ),
      ),
    ).toEqual(reference)
  })

  it('requires an other-gas name only when other is selected', () => {
    const otherGas = field('process_steps', 'other_gas_name')
    expect(
      isProcessStepFieldVisible(otherGas, 'growth', null, {
        gas_species: ['Ar'],
      }),
    ).toBe(false)
    expect(
      isProcessStepFieldVisible(otherGas, 'growth', null, {
        gas_species: ['Ar', 'other'],
      }),
    ).toBe(true)
    expect(
      missingProcessStepKeys(
        {
          stage_type: 'growth',
          gas_species: ['Ar', 'other'],
          gas_flow_sccm: '10（MFC）',
          pressure_system: '100（low_pressure）',
        },
        null,
      ),
    ).toContain('other_gas_name')
  })

  it('round-trips the internal substrate source id without treating it as content', () => {
    const sourceId = '00000000-0000-4000-8000-000000000001'
    expect(
      buildItemPayload('substrates', {
        ...emptyModuleValues('substrates'),
        source_id: sourceId,
        material: '蓝宝石',
      }),
    ).toMatchObject({ material: 'sapphire', source_id: sourceId })
    expect(itemHasAnyValue({ source_id: sourceId })).toBe(false)
    expect(
      itemsFromPayload('substrates', {
        items: [{ source_id: sourceId, material: '蓝宝石' }],
      })[0],
    ).toMatchObject({ source_id: sourceId, material: 'sapphire' })
  })
})

describe('missingRequiredKeys', () => {
  it('flags empty required §1 fields', () => {
    expect(missingRequiredKeys('basic_info', {})).toEqual(
      expect.arrayContaining([
        'started_at',
        'synthesis_method',
        'operator',
        'run_code',
      ]),
    )
  })

  it('flags amount as missing only for non-gas precursors', () => {
    expect(
      missingRequiredKeys('precursors', {
        name_formula: 'MoO₃',
        phase_state: '固',
      }),
    ).toContain('amount')
    expect(
      missingRequiredKeys('precursors', {
        name_formula: 'Ar',
        phase_state: '气',
      }),
    ).not.toContain('amount')
  })
})
