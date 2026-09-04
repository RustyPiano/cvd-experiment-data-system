import { experimentModules } from '@/shared/generated/field-metadata'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import { canonicalFieldOption } from '@/shared/field-i18n'
import { assertValidNumber } from '@/shared/field-validation'
import {
  isStructuredInput,
  structuredPayload,
  structuredValueFromRaw,
} from '@/shared/structured-field'

import { normalizeChemicalFormula } from './formula'

export type ModuleFieldValue = string | string[]
export type ModuleValues = Record<string, ModuleFieldValue>
export interface SubstratePlacementRelation {
  piece_a_label: string
  piece_b_label: string
  gap_mm?: number | null
}

export function moduleValueAsString(
  value: ModuleFieldValue | undefined,
): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export function getModuleFields(moduleKey: string): FieldMetadata[] {
  return (experimentModules[moduleKey] ?? []).filter(
    (field) => !field.moduleLevel,
  )
}

export function emptySubstrateValues(): ModuleValues {
  return Object.fromEntries(
    getModuleFields('substrates').map((field) => [field.key, '']),
  )
}

function substrateValueFromPayload(field: FieldMetadata, raw: unknown): string {
  if (raw == null) return ''
  if (field.input === '实体版本引用' || field.key === 'pretreatment_steps') {
    return JSON.stringify(raw)
  }
  if (isStructuredInput(field.input) && typeof raw === 'object') {
    return structuredValueFromRaw(field.key, raw)
  }
  if (/(\u4e0b\u62c9|多选)/.test(field.input)) {
    return canonicalFieldOption(field.key, String(raw))
  }
  return String(raw)
}

export function substratesFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ModuleValues[] {
  const raw = payload?.['items']
  if (!Array.isArray(raw)) return []
  return raw.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>
    const values = emptySubstrateValues()
    for (const field of getModuleFields('substrates')) {
      values[field.key] = substrateValueFromPayload(field, item[field.key])
    }
    if (item['source_id'] != null)
      values['source_id'] = String(item['source_id'])
    return values
  })
}

export function substratePlacementRelationsFromPayload(
  payload: Record<string, unknown> | null | undefined,
): SubstratePlacementRelation[] {
  const relations = payload?.['placement_relations']
  return Array.isArray(relations)
    ? (relations as SubstratePlacementRelation[])
    : []
}

function substrateValueForPayload(
  field: FieldMetadata,
  value: ModuleFieldValue | undefined,
): unknown {
  const text = moduleValueAsString(value).trim()
  if (!text) return null
  if (field.input === '实体版本引用' || field.key === 'pretreatment_steps') {
    return JSON.parse(text) as unknown
  }
  if (isStructuredInput(field.input)) return structuredPayload(field.key, text)
  if (field.key === 'chemical_formula') return normalizeChemicalFormula(text)
  if (field.input === '数值') {
    return assertValidNumber(text, field.key, field.validation)
  }
  if (/(\u4e0b\u62c9|多选)/.test(field.input)) {
    return canonicalFieldOption(field.key, text)
  }
  return text
}

export function buildSubstratesPayload(
  items: ModuleValues[],
  placementRelations: SubstratePlacementRelation[] = [],
): {
  items: Record<string, unknown>[]
  placement_relations: SubstratePlacementRelation[]
} {
  return {
    items: items
      .filter((item) =>
        Object.entries(item).some(
          ([key, value]) =>
            key !== 'source_id' && moduleValueAsString(value).trim(),
        ),
      )
      .map((values) => ({
        ...Object.fromEntries(
          getModuleFields('substrates').map((field) => [
            field.key,
            substrateValueForPayload(field, values[field.key]),
          ]),
        ),
        ...(values['source_id']
          ? { source_id: moduleValueAsString(values['source_id']) }
          : {}),
      })),
    placement_relations: placementRelations,
  }
}
