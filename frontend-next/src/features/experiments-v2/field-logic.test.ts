import { describe, expect, it } from 'vitest'
import { experimentModules } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import {
  buildFlatModulePayload,
  buildItemPayload,
  buildItemsModulePayload,
  buildTargetProductPayload,
  emptyComponentRow,
  getComponentRoleOptions,
  isEffectivelyRequired,
  isFieldVisible,
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
      '基体',
      '掺杂剂',
      '上层',
      '下层',
      '横向域',
    ])
    expect(getComponentRoleOptions()).toContain('掺杂剂')
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

  it('item payload carries every field key; empty rows are filtered out', () => {
    const item = buildItemPayload('precursors', {
      name_formula: 'MoO₃',
      phase_state: '固',
    })
    expect(item.name_formula).toBe('MoO₃')
    expect(item.phase_state).toBe('固')
    expect('amount' in item).toBe(true)

    const module = buildItemsModulePayload('precursors', [
      { name_formula: 'MoO₃', phase_state: '固', amount: '5' },
      {},
    ])
    expect(module.items).toHaveLength(1)
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
