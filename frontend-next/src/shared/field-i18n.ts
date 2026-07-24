import {
  optionCodes,
  optionLabelsEn,
  optionLabelsZh,
  unitLabelsEn,
} from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'

export function isEnglish(language: string): boolean {
  return language.startsWith('en')
}

function stripSubcategoryPrefix(label: string): string {
  return label.replace(/^▸[^·]+·/, '')
}

export function localizedFieldLabel(
  field: FieldMetadata,
  language: string,
): string {
  const label = isEnglish(language)
    ? field.labelEn || field.labelZh
    : field.labelZh
  return stripSubcategoryPrefix(label)
}

export function localizedOption(value: string, language: string): string {
  const code = canonicalOption(value)
  return isEnglish(language)
    ? (optionLabelsEn[code] ?? value)
    : (optionLabelsZh[code] ?? value)
}

/** 旧中文选项值只在读取时兼容；所有新提交统一使用稳定 ASCII 机器码。 */
export function canonicalOption(value: string): string {
  return optionCodes[value] ?? value
}

/** Localize scalar or multi-select values without collapsing arrays before lookup. */
export function localizedValue(value: unknown, language: string): string {
  if (value == null || value === '') return ''
  if (Array.isArray(value)) {
    return value
      .map((item) => localizedOption(String(item), language))
      .join(' · ')
  }
  if (typeof value === 'object') {
    const composite = value as { value?: unknown; option?: unknown }
    if ('value' in composite || 'option' in composite) {
      const free =
        composite.value == null || composite.value === ''
          ? ''
          : String(composite.value)
      const selected =
        composite.option == null || composite.option === ''
          ? ''
          : localizedOption(String(composite.option), language)
      return [free, selected].filter(Boolean).join(' · ')
    }
    return JSON.stringify(value)
  }
  return localizedOption(String(value), language)
}

export function localizedNamedValue(
  value: unknown,
  language: string,
  labels: Readonly<Record<string, string>>,
): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return localizedValue(value, language)
  }
  const colon = isEnglish(language) ? ': ' : '：'
  return Object.entries(value)
    .filter(([, item]) => item != null && item !== '')
    .map(
      ([key, item]) =>
        `${labels[key] ?? key}${colon}${localizedValue(item, language)}`,
    )
    .join(' · ')
}

export function localizedUnit(
  unit: string | null,
  language: string,
): string | null {
  if (!unit || !isEnglish(language)) return unit
  return unitLabelsEn[unit] ?? unit
}

export function localizedParenthetical(
  value: string,
  language: string,
): string {
  return isEnglish(language) ? `(${value})` : `（${value}）`
}

export function localizedUnitLabel(
  unit: string | null,
  language: string,
): string | null {
  const localized = localizedUnit(unit, language)
  return localized ? localizedParenthetical(localized, language) : null
}

export function localizedFieldPlaceholder(
  field: FieldMetadata,
  language: string,
): string {
  return isEnglish(language)
    ? field.placeholderEn || field.placeholderZh
    : field.placeholderZh
}

export function localizedFieldHelp(
  field: FieldMetadata,
  language: string,
): string | null {
  return isEnglish(language) ? field.helpEn || field.helpZh : field.helpZh
}
