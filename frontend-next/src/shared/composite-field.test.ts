import { describe, expect, it } from 'vitest'
import {
  formatCompositeValue,
  parseCompositeValue,
  parseCompositeOptions,
} from './composite-field'

describe('composite field serialization', () => {
  it.each([
    ['数值+下拉', '80', 'MFC', '80（MFC）'],
    [
      '文本+下拉',
      'Si(100)',
      'single_side_polished',
      'Si(100)（single_side_polished）',
    ],
    [
      '下拉+数值',
      '1.0×10⁵ Pa',
      'atmospheric_pressure',
      'atmospheric_pressure；1.0×10⁵ Pa',
    ],
    ['下拉+文本', '单层2H', 'unspecified', 'unspecified；单层2H'],
  ] as const)(
    'round-trips %s values',
    (input, freeValue, option, serialized) => {
      const options = [option]
      expect(formatCompositeValue(input, freeValue, option)).toBe(serialized)
      expect(parseCompositeValue(input, serialized, options)).toEqual({
        freeValue,
        option,
      })
    },
  )

  it.each([
    ['数值+下拉', '80', { freeValue: '80', option: '' }],
    ['数值+下拉', 'MFC', { freeValue: '', option: 'MFC' }],
    ['下拉+数值', '1.0×10⁵ Pa', { freeValue: '1.0×10⁵ Pa', option: '' }],
    [
      '下拉+数值',
      '常压(APCVD)',
      { freeValue: '', option: 'atmospheric_pressure' },
    ],
  ] as const)(
    'keeps a single %s half without punctuation',
    (input, value, expected) => {
      expect(parseCompositeValue(input, value, ['MFC', '常压(APCVD)'])).toEqual(
        expected,
      )
    },
  )

  it('falls back to the free input when a stored value cannot be parsed', () => {
    expect(
      parseCompositeValue('下拉+数值', 'legacy unstructured value', ['常压']),
    ).toEqual({
      freeValue: 'legacy unstructured value',
      option: '',
    })
  })

  it('extracts options from descriptive composite metadata', () => {
    expect(parseCompositeOptions('常压(APCVD)/低压(LPCVD)/超高真空')).toEqual([
      '常压(APCVD)',
      '低压(LPCVD)',
      '超高真空',
    ])
  })
})
