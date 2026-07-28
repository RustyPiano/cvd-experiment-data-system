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
  itemHasAnyValue,
  itemsFromPayload,
  moduleValueAsString,
  moduleValuesFromPayload,
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
    expect(resolveModuleConditionKey('precursors', '前驱体.本次使用形态')).toBe(
      'phase_state',
    )
    expect(
      resolveModuleConditionKey('substrates', '衬底.衬底材料（来自批次）'),
    ).toBe('material')
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

  it('hides amount for gas and before phase is chosen', () => {
    expect(isFieldVisible('precursors', amount, { phase_state: '气' })).toBe(
      false,
    )
    expect(isFieldVisible('precursors', amount, {})).toBe(false)
    expect(isFieldVisible('precursors', amount, { phase_state: '固' })).toBe(
      true,
    )
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

describe('装载方式 → 源容器与位置', () => {
  const sourceContainer = field('precursors', 'source_container')
  const sourcePosition = field('precursors', 'source_position')

  it('requires both fields for a source container but not substrate coating', () => {
    expect(
      isEffectivelyRequired('precursors', sourceContainer, {
        phase_state: '固',
        loading_method: '舟',
      }),
    ).toBe(true)
    expect(
      isEffectivelyRequired('precursors', sourcePosition, {
        phase_state: '固',
        loading_method: '舟',
      }),
    ).toBe(true)
    expect(
      isEffectivelyRequired('precursors', sourceContainer, {
        phase_state: '固',
        loading_method: '衬底表面',
      }),
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

describe('衬底偏转角 → 偏转方向 (miscut direction)', () => {
  const direction = field('substrates', 'miscut_direction')

  it('requires the direction only when the angle is positive', () => {
    expect(
      isFieldVisible('substrates', direction, {
        miscut_availability: 'reported',
        miscut_angle_deg: '0.2',
      }),
    ).toBe(true)
    expect(
      isFieldVisible('substrates', direction, {
        miscut_availability: 'reported',
        miscut_angle_deg: '0',
      }),
    ).toBe(false)
    expect(
      isEffectivelyRequired('substrates', direction, {
        miscut_angle_deg: '0.2',
      }),
    ).toBe(true)
    expect(
      isEffectivelyRequired('substrates', direction, {
        miscut_angle_deg: '0',
      }),
    ).toBe(false)
    expect(
      buildItemPayload('substrates', {
        miscut_availability: 'reported',
        miscut_angle_deg: '0',
        miscut_direction: 'toward a-axis',
      }).miscut_direction,
    ).toBeNull()
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
      'material_layer',
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
        formula: 'MoS2',
        role: 'matrix',
        concentration_at_percent: null,
        layer_order: null,
        bulk_space_group: null,
      },
      {
        formula: 'Nb',
        role: 'dopant',
        concentration_at_percent: 0.5,
        layer_order: null,
        bulk_space_group: null,
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
      buildItemPayload('precursors', {
        phase_state: 'gas',
        amount: '20',
      }).amount,
    ).toBeNull()
    expect(
      buildItemPayload('substrates', {
        material: 'sapphire_al2o3',
        oxide_thickness_nm: '285',
      }).oxide_thickness_nm,
    ).toBeNull()
    expect(
      buildItemPayload('process_events', {
        terminated_run: 'false',
        termination_reason: 'other',
        description: 'stale termination details',
      }),
    ).toMatchObject({
      terminated_run: false,
      termination_reason: null,
      description: 'stale termination details',
    })
  })

  it('keeps event description optional except when termination reason is other', () => {
    const description = field('process_events', 'description')
    expect(
      isFieldVisible('process_events', description, {
        terminated_run: 'false',
      }),
    ).toBe(true)
    expect(
      isEffectivelyRequired('process_events', description, {
        terminated_run: 'true',
        termination_reason: 'equipment_alarm',
      }),
    ).toBe(false)
    expect(
      missingRequiredKeys('process_events', {
        terminated_run: 'true',
        termination_reason: 'other',
      }),
    ).toContain('description')
    expect(
      isEffectivelyRequired('process_events', description, {
        terminated_run: 'false',
        termination_reason: 'other',
      }),
    ).toBe(false)
    expect(
      missingRequiredKeys('process_events', {
        terminated_run: 'false',
        termination_reason: 'other',
      }),
    ).not.toContain('description')
  })

  it('clears external-field values when the selected setup has no field device', () => {
    const payload = buildProcessStepsPayload(
      [
        {
          ...emptyModuleValues('process_steps'),
          stage_type: 'reaction_conditions',
          pressure_system: 'atmospheric_pressure',
          field_params:
            '[{"field_type":"light","start_min":0,"end_min":10,"parameters":[]}]',
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
          role: '',
          concentration_at_percent: '25',
          layer_order: '1',
        },
      ],
    )

    expect(vertical.components).toEqual([
      {
        formula: 'MoS2',
        role: 'material_layer',
        concentration_at_percent: null,
        layer_order: 1,
        bulk_space_group: null,
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

  it('round-trips structured per-gas feeds without collapsing the array', () => {
    const feeds = [
      {
        species: 'Ar',
        lot_ref: {
          entity_id: '7d9e7787-e5ef-4f34-818f-454a10263a3b',
          version: 1,
          snapshot: { lot_code: 'AR-1' },
        },
        measurement_source: 'mfc',
        intervals: [{ start_min: 0, end_min: 10, flow_sccm: 100 }],
      },
    ]
    const restored = moduleValuesFromPayload('process_steps', {
      gas_feeds: feeds,
    })
    expect(JSON.parse(restored.gas_feeds as string)).toEqual(feeds)
    const payload = buildItemPayload('process_steps', restored)
    expect(payload.gas_feeds).toEqual(feeds)
  })

  it('canonicalizes legacy component roles when entering edit state', () => {
    expect(
      componentsFromPayload({
        structure_type: 'doped',
        components: [
          { formula: 'MoS2', role: '基体' },
          { formula: 'Nb', role: '掺杂剂' },
        ],
      }),
    ).toEqual([expect.objectContaining({ formula: 'Nb', role: 'dopant' })])
  })

  it('item payload carries every field key; empty rows are filtered out', () => {
    const item = buildItemPayload('precursors', {
      phase_state: '固',
    })
    expect(item.phase_state).toBe('solid')
    expect('amount' in item).toBe(true)

    const module = buildItemsModulePayload('precursors', [
      { phase_state: '固', amount: '5' },
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
      phase_state: 'solid',
      loading_method: 'boat',
      source_container: JSON.stringify({
        material: 'quartz',
        length_mm: '90',
        width_mm: '15',
        height_mm: '5',
        reset_count: '1',
        use_number_since_reset: '7',
      }),
      source_position: JSON.stringify({
        zone_index: '1',
        distance_mm: '-20',
        temperature_C: '620',
        temperature_basis: 'estimate',
      }),
    })

    expect(item.lot_ref).toEqual(reference)
    expect(item.source_container).toEqual({
      material: 'quartz',
      material_other: null,
      length_mm: 90,
      width_mm: 15,
      height_mm: 5,
      reset_count: 1,
      use_number_since_reset: 7,
    })
    expect(item.source_position).toEqual({
      zone_index: 1,
      distance_mm: -20,
      temperature_C: 620,
      temperature_basis: 'estimate',
    })
    expect(
      JSON.parse(
        moduleValueAsString(
          itemsFromPayload('precursors', { items: [item] })[0].lot_ref,
        ),
      ),
    ).toEqual(reference)
  })

  it('round-trips structured substrate surface roughness', () => {
    const restored = moduleValuesFromPayload('substrates', {
      surface_roughness: { metric: 'RMS', value_nm: 0.25 },
    })
    expect(JSON.parse(restored.surface_roughness as string)).toEqual({
      availability: 'reported',
      metric: 'RMS',
      value_nm: 0.25,
    })
    expect(buildItemPayload('substrates', restored).surface_roughness).toEqual({
      availability: 'reported',
      metric: 'RMS',
      value_nm: 0.25,
    })
  })

  it('restores the legacy 等离子 pretreatment as plasma_treatment', () => {
    const restored = moduleValuesFromPayload('substrates', {
      pretreatment_steps: [
        {
          type: '等离子',
          parameters: {
            power_W: 50,
            gas_species: 'Ar',
            pressure_Pa: 20,
            duration_min: 5,
          },
        },
      ],
    })

    expect(JSON.parse(restored.pretreatment_steps as string)[0].type).toBe(
      'plasma_treatment',
    )
  })

  it('round-trips the internal substrate source id without treating it as content', () => {
    const sourceId = '00000000-0000-4000-8000-000000000001'
    expect(
      buildItemPayload('substrates', {
        ...emptyModuleValues('substrates'),
        source_id: sourceId,
        material: '蓝宝石',
      }),
    ).toMatchObject({ material: 'sapphire_al2o3', source_id: sourceId })
    expect(itemHasAnyValue({ source_id: sourceId })).toBe(false)
    expect(
      itemsFromPayload('substrates', {
        items: [{ source_id: sourceId, material: '蓝宝石' }],
      })[0],
    ).toMatchObject({ source_id: sourceId, material: 'sapphire_al2o3' })
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
        phase_state: '固',
      }),
    ).toContain('amount')
    expect(
      missingRequiredKeys('precursors', {
        phase_state: '气',
      }),
    ).not.toContain('amount')
  })

  it('flags source container and position for container loading', () => {
    expect(
      missingRequiredKeys('precursors', {
        phase_state: '固',
        loading_method: '舟',
      }),
    ).toEqual(expect.arrayContaining(['source_container', 'source_position']))
    expect(
      missingRequiredKeys('precursors', {
        phase_state: '固',
        loading_method: '舟',
        source_container: JSON.stringify({ material: 'quartz' }),
        source_position: JSON.stringify({ zone_index: 1, distance_mm: -20 }),
      }),
    ).not.toEqual(
      expect.arrayContaining(['source_container', 'source_position']),
    )
  })

  it('flags miscut direction when the substrate angle is positive', () => {
    expect(
      missingRequiredKeys('substrates', {
        miscut_availability: 'reported',
        miscut_angle_deg: '0.2',
      }),
    ).toContain('miscut_direction')
    expect(
      missingRequiredKeys('substrates', {
        miscut_availability: 'reported',
        miscut_angle_deg: '0',
      }),
    ).not.toContain('miscut_direction')
    expect(
      missingRequiredKeys('substrates', {
        miscut_availability: 'reported',
        miscut_angle_deg: '0.2',
        miscut_direction: 'x面向x轴偏2°',
      }),
    ).not.toContain('miscut_direction')
  })
})
