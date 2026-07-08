// §5 过程步（阶段类型→参数组显隐/必填 + payload union 契约）与 §8 PVD 显隐判别的单测。
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
  hasExternalFieldSetup,
  isProcessStepFieldRequired,
  isProcessStepFieldVisible,
  isPvdApplicable,
  isPvdFieldRequired,
  missingProcessStepKeys,
  pvdMethods,
  visibleGroupsForStage,
} from './field-logic'

const stepFields = experimentModules.process_steps
const stepField = (key: string): FieldMetadata =>
  stepFields.find((f) => f.key === key) as FieldMetadata

const groupOf = (field: FieldMetadata) => field.group ?? 'common'
const allowedGroups = (shows: string[]) => new Set(['common', ...shows])
const setupWithExternal = { field_devices: '光' }
const setupNoExternal = { field_devices: '无' }

describe('§5 阶段类型 → 参数组显隐（对照 stageTypes 全 11 项）', () => {
  // Freeze gate: changing the number of stage types requires an explicit decision
  // (edit field-source.yaml `stage_types`, re-run gen:fields, then update this count).
  it('covers exactly 11 stage types', () => {
    expect(stageTypes).toHaveLength(11)
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

  it('common 组恒显，即便阶段 shows 为空（卸样）', () => {
    for (const field of stepFields.filter((f) => groupOf(f) === 'common')) {
      expect(isProcessStepFieldVisible(field, '卸样', null)).toBe(true)
    }
  })
})

describe('§5 外场组跨实体条件（§2 Setup 快照 field_devices≠无）', () => {
  const fieldParams = stepField('field_params')

  it('外场字段仅在「阶段 shows 外场 且 Setup 有外场」时出现', () => {
    // 反应生长 shows external_field
    expect(
      isProcessStepFieldVisible(fieldParams, '反应生长', setupWithExternal),
    ).toBe(true)
    expect(
      isProcessStepFieldVisible(fieldParams, '反应生长', setupNoExternal),
    ).toBe(false)
    expect(isProcessStepFieldVisible(fieldParams, '反应生长', null)).toBe(false)
    // 升温 不 shows external_field，即便 Setup 有外场也不显示
    expect(
      isProcessStepFieldVisible(fieldParams, '升温', setupWithExternal),
    ).toBe(false)
  })

  it('外场字段可见时条件必填', () => {
    expect(
      isProcessStepFieldRequired(fieldParams, '反应生长', setupWithExternal),
    ).toBe(true)
    expect(
      isProcessStepFieldRequired(fieldParams, '反应生长', setupNoExternal),
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

describe('§5 组内条件必填（降温组 / 反应生长压力体系）', () => {
  it('降温方式仅在降温段出现且必填', () => {
    const cooling = stepField('cooling_params')
    expect(isProcessStepFieldVisible(cooling, '降温', null)).toBe(true)
    expect(isProcessStepFieldRequired(cooling, '降温', null)).toBe(true)
    expect(isProcessStepFieldVisible(cooling, '升温', null)).toBe(false)
  })

  it('压力体系仅在反应生长必填（required_extra），其余阶段仅可见', () => {
    const pressure = stepField('pressure_system')
    expect(isProcessStepFieldRequired(pressure, '反应生长', null)).toBe(true)
    expect(isProcessStepFieldVisible(pressure, '吹扫', null)).toBe(true)
    expect(isProcessStepFieldRequired(pressure, '吹扫', null)).toBe(false)
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
      { stage_type: '卸样' },
    ])
    expect(items).toHaveLength(1)
    expect(items[0].stage_type).toBe('卸样')
  })

  it('允许键的空值下发 null，越域键不出现', () => {
    const payload = buildProcessStepPayload({
      stage_type: '反应生长',
      temperature_program: '900/10/30',
      gas_species: 'CH₄',
    }) as Record<string, unknown>
    expect(payload.temperature_program).toBe('900/10/30')
    expect(payload.gas_species).toBe('CH₄')
    expect(payload.pressure_system).toBeNull()
    // cooling_params 属降温组，不在反应生长的键集内
    expect('cooling_params' in payload).toBe(false)
  })

  it('missingProcessStepKeys 标记可见必填空缺（反应生长压力体系）', () => {
    const missing = missingProcessStepKeys(
      {
        stage_type: '反应生长',
        temperature_program: 'x',
        gas_species: 'Ar',
        gas_flow_sccm: '10',
      },
      null,
    )
    expect(missing).toContain('pressure_system')
  })
})

describe('§8 PVD 显隐判别（§1 合成方法驱动）', () => {
  it('仅 PVD 体系合成方法适用', () => {
    for (const method of pvdMethods()) {
      expect(isPvdApplicable(method)).toBe(true)
    }
    expect(pvdMethods()).toEqual(
      expect.arrayContaining(['PVD-磁控溅射', 'PVD-热蒸发', 'PLD']),
    )
    expect(isPvdApplicable('CVD')).toBe(false)
    expect(isPvdApplicable('')).toBe(false)
  })

  it('PVD 适用时字段条件必填，否则不必填', () => {
    const field = experimentModules.pvd[0]
    expect(isPvdFieldRequired(field, 'PVD-磁控溅射')).toBe(true)
    expect(isPvdFieldRequired(field, 'CVD')).toBe(false)
    expect(isPvdFieldRequired(field, '')).toBe(false)
  })
})
