// §5 过程记录（记录类型→参数组显隐/必填 + payload union 契约）的单测。
// 映射与契约的唯一源 = 生成物 stageTypes/stageGroups（YAML `stage_types` 节，与后端 union
// 生成器同源）；本测试用它反推期望值，任何映射改动经 gen:fields 后测试自动对齐。
import { describe, expect, it } from 'vitest'
import {
  experimentModules,
  stageTypes,
} from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import {
  buildProcessStepPayload,
  buildProcessStepsPayload,
  derivedReactionCycleCount,
  hasExternalFieldSetup,
  isProcessStepFieldRequired,
  isProcessStepFieldVisible,
  isRetiredProcessStage,
  missingProcessStepKeys,
  processStepOrderIsValid,
  visibleGroupsForStage,
} from './field-logic'

const stepFields = experimentModules.process_steps
const stepField = (key: string): FieldMetadata =>
  stepFields.find((f) => f.key === key) as FieldMetadata

const groupOf = (field: FieldMetadata) => field.group ?? 'common'
const allowedGroups = (shows: string[]) => new Set(['common', ...shows])
const setupWithExternal = { field_devices: '光' }
const setupNoExternal = { field_devices: '无' }

describe('§5 记录类型 → 参数组显隐（对照 stageTypes）', () => {
  it('covers exactly the three frozen record types', () => {
    expect(stageTypes.map((stage) => stage.name)).toEqual([
      'preparation',
      'reaction_conditions',
      'other',
    ])
  })

  for (const stage of stageTypes) {
    it(`${stage.name}: 仅 common ∪ shows 组字段可见`, () => {
      const allowed = allowedGroups(stage.shows)
      // 外场组给带外场的 Setup，以便可见性完全由「组∈shows」决定。
      for (const field of stepFields) {
        expect(
          isProcessStepFieldVisible(field, stage.name, setupWithExternal),
        ).toBe(allowed.has(groupOf(field)))
      }
      expect([...visibleGroupsForStage(stage.name)].sort()).toEqual(
        [...allowed].sort(),
      )
    })
  }

  it('common 组恒显', () => {
    for (const field of stepFields.filter((f) => groupOf(f) === 'common')) {
      expect(isProcessStepFieldVisible(field, 'other', null)).toBe(true)
    }
  })

  it('明确识别旧版阶段，空值和现行记录不误报', () => {
    expect(isRetiredProcessStage('卸样')).toBe(true)
    expect(isRetiredProcessStage('reaction_conditions')).toBe(false)
    expect(isRetiredProcessStage('')).toBe(false)
  })
})

describe('§5 外场组跨实体条件（§2 Setup 快照 field_devices≠无）', () => {
  const fieldParams = stepField('field_params')

  it('外场字段仅在「阶段 shows 外场 且 Setup 有外场」时出现', () => {
    // 反应条件记录 shows external_field
    expect(
      isProcessStepFieldVisible(
        fieldParams,
        'reaction_conditions',
        setupWithExternal,
      ),
    ).toBe(true)
    expect(
      isProcessStepFieldVisible(
        fieldParams,
        'reaction_conditions',
        setupNoExternal,
      ),
    ).toBe(false)
    expect(
      isProcessStepFieldVisible(fieldParams, 'reaction_conditions', null),
    ).toBe(false)
    // 预处理不 shows external_field，即便 Setup 有外场也不显示
    expect(
      isProcessStepFieldVisible(fieldParams, 'preparation', setupWithExternal),
    ).toBe(false)
  })

  it('外场字段可见时仍为选填', () => {
    expect(
      isProcessStepFieldRequired(
        fieldParams,
        'reaction_conditions',
        setupWithExternal,
      ),
    ).toBe(false)
    expect(
      isProcessStepFieldRequired(
        fieldParams,
        'reaction_conditions',
        setupNoExternal,
      ),
    ).toBe(false)
  })

  it('hasExternalFieldSetup 正确处理 无/数组/缺失', () => {
    expect(hasExternalFieldSetup({ field_devices: '光' })).toBe(true)
    expect(hasExternalFieldSetup({ field_devices: '无' })).toBe(false)
    expect(hasExternalFieldSetup({ field_devices: ['无'] })).toBe(false)
    expect(hasExternalFieldSetup({ field_devices: ['光', '电'] })).toBe(true)
    expect(hasExternalFieldSetup({})).toBe(false)
    expect(hasExternalFieldSetup(null)).toBe(false)
  })
})

describe('§5 组内条件必填（反应条件记录）', () => {
  it('降温参数仅在反应条件记录出现且为推荐', () => {
    const cooling = stepField('cooling_params')
    expect(
      isProcessStepFieldVisible(cooling, 'reaction_conditions', null),
    ).toBe(true)
    expect(
      isProcessStepFieldRequired(cooling, 'reaction_conditions', null),
    ).toBe(false)
    expect(isProcessStepFieldVisible(cooling, 'preparation', null)).toBe(false)
  })

  it('压力体系仅在反应条件记录可见且必填', () => {
    const pressure = stepField('pressure_system')
    expect(
      isProcessStepFieldRequired(pressure, 'reaction_conditions', null),
    ).toBe(true)
    expect(
      isProcessStepFieldVisible(pressure, 'reaction_conditions', null),
    ).toBe(true)
    expect(isProcessStepFieldVisible(pressure, 'preparation', null)).toBe(false)
  })
})

describe('§5 payload 键集对齐 discriminated union（同 stage_types 源）', () => {
  for (const stage of stageTypes) {
    it(`${stage.name}: payload 键 = common ∪ shows 组字段键`, () => {
      const allowed = allowedGroups(stage.shows)
      const expectedKeys = stepFields
        .filter((f) => allowed.has(groupOf(f)))
        .map((f) => f.key)
        .sort()
      const payload = buildProcessStepPayload({ stage_type: stage.name })
      expect(payload).not.toBeNull()
      expect(Object.keys(payload as object).sort()).toEqual(expectedKeys)
      expect((payload as Record<string, unknown>).stage_type).toBe(stage.name)
    })
  }

  it('未选阶段的空步被丢弃；已选阶段保留', () => {
    const { items } = buildProcessStepsPayload([
      { stage_type: '' },
      { stage_type: 'other' },
    ])
    expect(items).toHaveLength(1)
    expect(items[0].stage_type).toBe('other')
  })

  it('允许键的空值下发 null，越域键不出现', () => {
    const payload = buildProcessStepPayload({
      stage_type: 'reaction_conditions',
      temperature_program: '{"zones":[]}',
      gas_feeds: '[]',
    }) as Record<string, unknown>
    expect(payload.temperature_program).toEqual({ zones: [] })
    expect(payload.gas_feeds).toEqual([])
    expect(payload.pressure_system).toBeNull()
    expect('preparation_operations' in payload).toBe(false)
  })

  it('missingProcessStepKeys 标记反应条件记录的必填空缺', () => {
    const missing = missingProcessStepKeys(
      {
        stage_type: 'reaction_conditions',
        temperature_program: '{"zones":[{"zone_index":1,"points":[]}]}',
        gas_feeds: '[{"species":"Ar"}]',
      },
      null,
    )
    expect(missing).toContain('pressure_system')
  })

  it('保留其他记录任意位置，但预处理必须早于反应条件', () => {
    expect(
      processStepOrderIsValid([
        { stage_type: 'other' },
        { stage_type: 'preparation' },
        { stage_type: 'other' },
        { stage_type: 'reaction_conditions' },
      ]),
    ).toBe(true)
    expect(
      processStepOrderIsValid([
        { stage_type: 'reaction_conditions' },
        { stage_type: 'other' },
        { stage_type: 'preparation' },
      ]),
    ).toBe(false)
  })

  it.each([1, 2, 3])(
    '按单一气体的 %i 个供气区间覆盖提交循环数',
    (intervalCount) => {
      const intervals = Array.from({ length: intervalCount }, (_, index) => ({
        start_min: index * 10,
        end_min: index * 10 + 5,
        flow_sccm: 80,
      }))
      const payload = buildProcessStepPayload({
        stage_type: 'reaction_conditions',
        gas_feeds: JSON.stringify([{ species: 'Ar', intervals }]),
        duration_cycles: JSON.stringify({
          duration_min: 60,
          cycle_count: 99,
        }),
      }) as Record<string, unknown>

      expect(payload.duration_cycles).toEqual({
        duration_min: 60,
        cycle_count: intervalCount,
      })
    },
  )

  it('循环数取单一气体供气区间数的最大值，无供气时为空', () => {
    expect(
      derivedReactionCycleCount([
        { intervals: [{}, {}] },
        { intervals: [{}, {}, {}] },
      ]),
    ).toBe(3)
    expect(derivedReactionCycleCount([])).toBeNull()
  })
})
