import { describe, expect, it } from 'vitest'

import { characterizationProperties } from '@/shared/generated/field-metadata'
import {
  DATASET_PROPERTY_OPTIONS,
  canAddDatasetFilter,
  datasetFilterIssue,
  toDatasetFilter,
} from './dataset-query-page'

describe('dataset filter boundaries', () => {
  const textFilter = (value: string) => ({
    field: 'target_formula',
    operator: 'contains',
    value,
    propertyCode: 'coverage_percent',
  })

  it('accepts 255 trimmed text characters and rejects 256', () => {
    expect(datasetFilterIssue(textFilter(` ${'x'.repeat(255)} `))).toBeNull()
    expect(datasetFilterIssue(textFilter('x'.repeat(256)))).toBe(
      '筛选值不能超过 255 个字符',
    )
  })

  it('stops adding filters at the 50-filter API limit', () => {
    expect(canAddDatasetFilter(49)).toBe(true)
    expect(canAddDatasetFilter(50)).toBe(false)
    expect(canAddDatasetFilter(51)).toBe(false)
  })
})

describe('dataset property options', () => {
  it('derives every numeric property option from the characterization SSOT', () => {
    const expectedCodes = Object.entries(characterizationProperties)
      .filter(([, property]) => property.value_type === 'numeric')
      .map(([code]) => code)

    expect(DATASET_PROPERTY_OPTIONS.map((option) => option.code)).toEqual(
      expectedCodes,
    )
    expect(DATASET_PROPERTY_OPTIONS.map((option) => option.code)).not.toContain(
      'layer_count',
    )
    for (const option of DATASET_PROPERTY_OPTIONS) {
      expect(characterizationProperties[option.code]?.value_type).toBe(
        'numeric',
      )
    }
  })
})

describe('dataset numeric filters', () => {
  const between = (value: string) => ({
    field: 'property',
    operator: 'between',
    value,
    propertyCode: 'coverage_percent',
  })

  it.each(['1,', ',2', 'abc,2', '1,NaN', '1,2,3'])(
    'rejects malformed interval %s',
    (value) => {
      expect(datasetFilterIssue(between(value))).not.toBeNull()
      expect(() => toDatasetFilter(between(value))).toThrow()
    },
  )

  it('rejects reversed intervals and normalizes a valid frozen filter', () => {
    expect(datasetFilterIssue(between('2,1'))).toBe('上限不能小于下限')
    const frozen = toDatasetFilter(between(' 1 , 2 '))
    const editedDraft = between('10,20')

    expect(frozen.value).toEqual([1, 2])
    expect(toDatasetFilter(editedDraft).value).toEqual([10, 20])
    expect(frozen.value).toEqual([1, 2])
  })

  it.each(['abc', 'NaN', 'Infinity'])(
    'rejects invalid scalar number %s',
    (value) => {
      expect(
        datasetFilterIssue({
          field: 'property',
          operator: 'eq',
          value,
          propertyCode: 'coverage_percent',
        }),
      ).toBe('请输入有效数值')
    },
  )
})
