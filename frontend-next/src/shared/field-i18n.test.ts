import { describe, expect, it } from 'vitest'

import { parseEnumOptions } from '@/features/entity-library/field-logic'
import { getComponentRoleOptions } from '@/features/experiments-v2/field-logic'
import {
  entities,
  experimentModules,
  optionCodes,
  optionLabelsEn,
  optionLabelsZh,
  stageTypes,
  unitLabelsEn,
} from '@/shared/generated/field-metadata'
import {
  canonicalFieldOption,
  localizedFieldLabel,
  localizedFieldHelp,
  localizedFieldPlaceholder,
  localizedNamedValue,
  localizedOption,
  localizedParenthetical,
  localizedUnit,
  localizedUnitLabel,
  localizedValue,
} from './field-i18n'

const CJK = /[\u3400-\u9fff]/

describe('field display localization', () => {
  it('has preferred bilingual labels for every machine code', () => {
    const fields = [
      ...Object.values(experimentModules).flat(),
      ...Object.values(entities).flat(),
    ]
    const options = fields.flatMap(
      (field) => parseEnumOptions(field.input, field.options, field.key) ?? [],
    )

    for (const code of new Set(Object.values(optionCodes))) {
      expect(optionLabelsZh[code], code).toBeTruthy()
      expect(optionLabelsEn[code], code).toBeTruthy()
      if (CJK.test(optionLabelsZh[code])) {
        expect(optionLabelsEn[code], code).not.toMatch(CJK)
      }
    }
    for (const option of new Set(options)) {
      expect(optionLabelsEn[option] ?? option, option).toBeTruthy()
    }
    for (const stage of stageTypes) {
      expect(stage.labelEn, stage.name).not.toMatch(CJK)
    }
    for (const role of getComponentRoleOptions()) {
      expect(optionLabelsEn[role], role).toBeTruthy()
      expect(localizedOption(role, 'en'), role).not.toMatch(CJK)
    }
  })

  it('localizes CJK units and strips internal category prefixes from labels', () => {
    const fields = [
      ...Object.values(experimentModules).flat(),
      ...Object.values(entities).flat(),
    ]
    for (const unit of new Set(
      fields
        .map((field) => field.unit)
        .filter((value) => value && CJK.test(value)),
    )) {
      expect(unitLabelsEn[unit!], unit!).toBeTruthy()
      expect(localizedUnit(unit, 'en'), unit!).not.toMatch(CJK)
    }

    const prefixed = fields.find((field) => field.labelZh.startsWith('▸'))
    expect(prefixed).toBeDefined()
    expect(localizedFieldLabel(prefixed!, 'zh')).not.toContain('▸')
  })

  it('uses locale-appropriate parentheses around units and context labels', () => {
    expect(localizedUnitLabel('层', 'en')).toBe('(layers)')
    expect(localizedUnitLabel('层', 'zh')).toBe('（层）')
    expect(localizedParenthetical('Target product', 'en')).toBe(
      '(Target product)',
    )
  })

  it('localizes every member of a multi-select array independently', () => {
    expect(localizedValue(['光', '电'], 'en')).toBe('Light · Electric field')
  })

  it('keeps plasma capability distinct from plasma pretreatment', () => {
    expect(canonicalFieldOption('field_devices', '等离子体')).toBe('plasma')
    expect(canonicalFieldOption('type', '等离子体')).toBe('plasma_treatment')
    expect(optionLabelsZh.plasma).toBe('等离子体')
  })

  it('renders structured composite values with localized options', () => {
    expect(localizedValue({ value: 2, option: 'tube_2_inch' }, 'zh')).toBe(
      '2 · 2″',
    )
    expect(localizedValue({ value: 101325, option: '常压(APCVD)' }, 'en')).toBe(
      '101325 · Atmospheric pressure (APCVD)',
    )
  })

  it('renders only explicitly named structured keys', () => {
    expect(
      localizedNamedValue(
        { value_nm: 0.42, entity_id: 'internal-id', snapshot: { raw: true } },
        'en',
        { value_nm: 'Roughness value (nm)' },
      ),
    ).toBe('Roughness value (nm): 0.42')
  })

  it('keeps canonical pressure labels ahead of compatibility aliases', () => {
    expect(optionLabelsZh.atmospheric_pressure).toBe('常压(APCVD)')
    expect(optionLabelsEn.atmospheric_pressure).toBe(
      'Atmospheric pressure (APCVD)',
    )
    expect(optionLabelsZh.low_pressure).toBe('低压(LPCVD)')
    expect(optionLabelsEn.low_pressure).toBe('Low pressure (LPCVD)')
  })

  it('provides independent bilingual placeholders and paired help text', () => {
    const fields = [
      ...Object.values(experimentModules).flat(),
      ...Object.values(entities).flat(),
    ]
    for (const field of fields) {
      expect(field.placeholderZh, field.key).toBeTruthy()
      expect(field.placeholderEn, field.key).toBeTruthy()
      expect(localizedFieldPlaceholder(field, 'zh')).toBe(field.placeholderZh)
      expect(localizedFieldPlaceholder(field, 'en')).toBe(field.placeholderEn)
      expect(Boolean(field.helpZh), field.key).toBe(Boolean(field.helpEn))
    }

    const runCode = experimentModules.basic_info.find(
      (field) => field.key === 'run_code',
    )!
    expect(localizedFieldHelp(runCode, 'zh')).toContain(
      '系统按年度顺序自动生成',
    )
    expect(localizedFieldHelp(runCode, 'zh')).toContain('不可修改')
    expect(localizedFieldHelp(runCode, 'en')).toContain(
      'Automatically generated by the system',
    )
    expect(localizedFieldHelp(runCode, 'en')).toContain('cannot be edited')
  })
})
