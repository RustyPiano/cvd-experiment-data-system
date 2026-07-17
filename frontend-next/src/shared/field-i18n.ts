import { optionLabelsEn, unitLabelsEn } from '@/shared/generated/field-metadata'
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
  return isEnglish(language) ? (optionLabelsEn[value] ?? value) : value
}

export function localizedUnit(
  unit: string | null,
  language: string,
): string | null {
  if (!unit || !isEnglish(language)) return unit
  return unitLabelsEn[unit] ?? unit
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
