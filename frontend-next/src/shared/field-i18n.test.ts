import { describe, expect, it } from 'vitest'

import { parseEnumOptions } from '@/features/entity-library/field-logic'
import { getComponentRoleOptions } from '@/features/experiments-v2/field-logic'
import {
  entities,
  experimentModules,
  optionLabelsEn,
  stageTypes,
  unitLabelsEn,
} from '@/shared/generated/field-metadata'
import {
  localizedFieldLabel,
  localizedFieldHelp,
  localizedFieldPlaceholder,
  localizedOption,
  localizedUnit,
} from './field-i18n'

const CJK = /[\u3400-\u9fff]/

describe('field display localization', () => {
  it('has an English display label for every canonical CJK option', () => {
    const fields = [
      ...Object.values(experimentModules).flat(),
      ...Object.values(entities).flat(),
    ]
    const options = fields.flatMap(
      (field) => parseEnumOptions(field.input, field.options) ?? [],
    )

    for (const option of new Set(options.filter((value) => CJK.test(value)))) {
      expect(optionLabelsEn[option], option).toBeTruthy()
      expect(localizedOption(option, 'en'), option).not.toMatch(CJK)
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
    expect(localizedFieldHelp(runCode, 'zh')).toContain('组内唯一')
    expect(localizedFieldHelp(runCode, 'en')).toContain('unique')
  })
})
