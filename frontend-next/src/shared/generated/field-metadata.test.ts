import { describe, expect, it } from 'vitest'
import {
  entities,
  experimentModules,
  stageGroups,
  stageTypes,
  unitLabelsEn,
} from './field-metadata'

describe('generated field-metadata', () => {
  it('groups the 81 experiment fields into the expected module keys', () => {
    const total = Object.values(experimentModules).reduce(
      (n, list) => n + list.length,
      0,
    )
    expect(total).toBe(81)
    expect(Object.keys(experimentModules)).toEqual([
      'basic_info',
      'target_product',
      'equipment',
      'precursors',
      'substrates',
      'process_steps',
      'process_events',
      'characterization',
      'measured_products',
      'pvd',
    ])
  })

  it('carries bilingual labels — precursors.appearance', () => {
    const appearance = experimentModules.precursors.find(
      (f) => f.key === 'appearance',
    )
    expect(appearance?.labelZh).toBe('外观描述')
    expect(appearance?.labelEn).toBe('Appearance at time of use')
  })

  it('emits conditional-required expressions with canonical values', () => {
    const amount = experimentModules.precursors.find((f) => f.key === 'amount')
    expect(amount?.requirement.level).toBe('conditional_required')
    expect(amount?.requirement.condition).toEqual({
      field: '前驱体.相态',
      op: 'ne',
      value: 'gas',
    })
    expect(amount?.r0).toBe(true)
  })

  it("normalizes the '—' placeholder to null but keeps raw option strings", () => {
    const startedAt = experimentModules.basic_info.find(
      (f) => f.key === 'started_at',
    )
    expect(startedAt?.unit).toBeNull()
    expect(startedAt?.options).toBeNull()
    const method = experimentModules.basic_info.find(
      (f) => f.key === 'synthesis_method',
    )
    expect(method?.options).toContain('APCVD')
  })

  it('preserves scalar and structured validation rules from the field source', () => {
    const humidity = experimentModules.basic_info.find(
      (field) => field.key === 'ambient_humidity_percent',
    )
    expect(humidity?.validation).toEqual({ ge: 0, le: 100 })

    const targetLayers = experimentModules.target_product.find(
      (field) => field.key === 'target_layer_count',
    )
    expect(targetLayers?.validation).toEqual({ type: 'integer', ge: 1 })

    const spectralMetrics = experimentModules.measured_products.find(
      (field) => field.key === 'key_spectral_metrics',
    )
    expect(spectralMetrics?.validation).toEqual({
      item_required: ['metric_code', 'value', 'unit'],
      finite_value: true,
    })

    const startedAt = experimentModules.basic_info.find(
      (field) => field.key === 'started_at',
    )
    expect(startedAt?.validation).toBeNull()
  })

  it('provides an English label for metric-dependent units', () => {
    expect(unitLabelsEn['按指标']).toBe('per metric')
  })

  it('keeps the R0 minimal-reproducible set at 18 fields', () => {
    const r0 = Object.values(experimentModules)
      .flat()
      .filter((f) => f.r0)
    expect(r0).toHaveLength(18)
  })

  it('tags every process_steps field with a valid stage param group', () => {
    const groupNames = new Set(Object.keys(stageGroups))
    for (const field of experimentModules.process_steps) {
      expect(field.group).not.toBeNull()
      expect(groupNames.has(field.group as string)).toBe(true)
    }
  })

  it('exposes the 11 stage types with their param groups (§5 dynamic form)', () => {
    expect(stageTypes).toHaveLength(11)
    const growth = stageTypes.find((s) => s.name === 'growth')
    expect(growth?.shows).toContain('temperature')
    expect(growth?.requiredExtra).toEqual(['pressure_system'])
    // every `shows` group must be a declared stageGroups key
    const groupNames = new Set(Object.keys(stageGroups))
    for (const stage of stageTypes) {
      for (const group of stage.shows) {
        expect(groupNames.has(group)).toBe(true)
      }
    }
  })

  it('emits all three first-class entities', () => {
    expect(Object.keys(entities)).toEqual([
      'material_lot',
      'setup',
      'instrument',
    ])
    const total = Object.values(entities).reduce(
      (n, list) => n + list.length,
      0,
    )
    expect(total).toBe(48)
  })

  it('carries input types for all six scalar-plus-option fields', () => {
    const compositeInputs = new Set([
      '数值+下拉',
      '下拉+数值',
      '文本+下拉',
      '下拉+文本',
      '文本+数值',
    ])
    const compositeFields = [
      ...Object.values(experimentModules),
      ...Object.values(entities),
    ]
      .flat()
      .filter((field) => compositeInputs.has(field.input))

    expect(compositeFields).toHaveLength(6)
    expect(compositeFields.map((field) => field.key)).toContain('gas_flow_sccm')
    expect(compositeFields.map((field) => field.key)).toContain(
      'pressure_system',
    )
  })
})
