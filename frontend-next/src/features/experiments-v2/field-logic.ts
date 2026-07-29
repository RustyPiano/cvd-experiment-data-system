// v2 实验录入表单的「元数据驱动」纯逻辑：模块字段取用、条件显隐、
// 重复条目载荷组装与历史 payload 回读。全部只读消费 field-metadata（生成物），
// 不含 React/网络；payload 键一律取字段 key（D10 契约）。
//
// 与后端契约对齐（backend/app/schemas/generated/v2_module_payload.py）：
//  - 各模块 payload 使用 `extra="forbid"`，这里只提交当前模块生成物中定义的键。
//  - target_product.components 只用于历史回读；当前科学表单使用一等实体写路径。
import { experimentModules } from '@/shared/generated/field-metadata'
import type {
  FieldCondition,
  FieldMetadata,
} from '@/shared/generated/field-metadata'
import {
  matchesCondition,
  parseEnumOptions,
} from '@/features/entity-library/field-logic'
import {
  formatCompositeValue,
  isCompositeInput,
  parseCompositeOptions,
  parseCompositeValue,
} from '@/shared/composite-field'
import { canonicalFieldOption, canonicalOption } from '@/shared/field-i18n'
import { normalizeChemicalFormula } from './formula'
import { isoToDateTimeLocal, toIsoDateTime } from './datetime'
import {
  isStructuredInput,
  structuredPayload,
  structuredValueFromRaw,
} from '@/shared/structured-field'
import { assertValidNumber } from '@/shared/field-validation'

export { matchesCondition, parseEnumOptions }

/** 单条模块的表单取值：多值字段全程保留数组，其余字段使用字符串。 */
export type ModuleFieldValue = string | string[]
export type ModuleValues = Record<string, ModuleFieldValue>

const JSON_FIELD_KEYS = new Set([
  'treatment_steps',
  'pretreatment_steps',
  'preparation_operations',
  'temperature_program',
  'measured_temperature',
  'gas_feeds',
  'duration_cycles',
  'cooling_params',
  'field_params',
  'attachment_file_ids',
])

function isBooleanInput(input: string): boolean {
  return input === '复选' || input === '复选确认'
}

export function isMultiValueInput(input: string): boolean {
  return input.includes('多选') || input.includes('多条')
}

export function moduleValueAsString(
  value: ModuleFieldValue | undefined,
): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

export function moduleValueIsEmpty(
  value: ModuleFieldValue | undefined,
): boolean {
  return Array.isArray(value) ? value.length === 0 : (value ?? '').trim() === ''
}

/** 历史 target_product.components 的回读行。 */
export interface ComponentRow {
  formula: string
  role: string
  concentration_at_percent: string
  layer_order: string
  bulk_space_group?: string
}

/** 该模块的字段元数据（生成物），未知模块返回空数组。 */
export function getModuleFields(moduleKey: string): FieldMetadata[] {
  return experimentModules[moduleKey] ?? []
}

/**
 * 把条件里的字段引用（如 '目标产物.结构类型' / '前驱体.相态' / '衬底.衬底材料'）解析为
 * 「同模块内被引用字段的 key」：取第一个 '.' 之后的部分与该模块字段的 labelZh 匹配。
 * v2 §1–§4 的条件均为模块内引用。跨模块引用解析不到时返回 null（按「条件不成立」兜底）。
 */
export function resolveModuleConditionKey(
  moduleKey: string,
  conditionField: string,
): string | null {
  const label = conditionField.slice(conditionField.indexOf('.') + 1)
  const field = getModuleFields(moduleKey).find(
    (item) => item.labelZh === label,
  )
  return field?.key ?? null
}

/**
 * 条件是否成立：驱动字段有具体取值且匹配。驱动值为空时判为「不成立」——
 * 使动态红星只在用户已选定驱动值后出现（如相态选定后才对用量强制）。
 */
export function isConditionSatisfied(
  condition: FieldCondition,
  values: ModuleValues,
  moduleKey: string,
): boolean {
  const refKey = resolveModuleConditionKey(moduleKey, condition.field)
  if (!refKey) return false
  const driverField = getModuleFields(moduleKey).find(
    (item) => item.key === refKey,
  )
  if (
    driverField?.visibilityGated &&
    !isFieldVisible(moduleKey, driverField, values)
  ) {
    return false
  }
  const driver = values[refKey] ?? ''
  if (driver === '') return false
  return matchesCondition(condition, driver)
}

export function isFieldVisible(
  moduleKey: string,
  field: FieldMetadata,
  values: ModuleValues,
): boolean {
  if (
    moduleKey === 'target_product' &&
    ['bulk_space_group', 'target_layer_count'].includes(field.key) &&
    ['vertical_heterostructure', 'lateral_heterostructure'].includes(
      canonicalOption(moduleValueAsString(values['structure_type'])),
    )
  ) {
    return false
  }
  if (
    moduleKey === 'substrates' &&
    field.key === 'miscut_direction' &&
    Number(moduleValueAsString(values['miscut_angle_deg'])) <= 0
  ) {
    return false
  }
  if (!field.visibilityGated) return true
  const condition = field.requirement.condition
  if (!condition) return true
  return isConditionSatisfied(condition, values, moduleKey)
}

/**
 * 字段在当前取值下是否「有效必填」（驱动动态红星）：
 *  - required 恒必填；
 *  - conditional_required 仅当条件成立时必填；
 *  - 其余级别（recommended / conditional_recommended / optional / definition / none）非必填。
 */
export function isEffectivelyRequired(
  moduleKey: string,
  field: FieldMetadata,
  values: ModuleValues,
): boolean {
  if (moduleKey === 'substrates' && field.key === 'miscut_direction') {
    return Number(moduleValueAsString(values['miscut_angle_deg'])) > 0
  }
  const level = field.requirement.level
  if (level === 'required') return true
  if (level === 'conditional_required') {
    const condition = field.requirement.condition
    return condition
      ? isConditionSatisfied(condition, values, moduleKey)
      : false
  }
  return false
}

function emptyToNull(value: ModuleFieldValue | undefined): string | null {
  const trimmed = moduleValueAsString(value).trim()
  return trimmed === '' ? null : trimmed
}

function fieldValueToPayload(
  field: FieldMetadata,
  value: ModuleFieldValue | undefined,
  structuredContext: {
    loadingMethod?: string | null
    zoneCount?: number | null
  } = {},
): unknown {
  if (isMultiValueInput(field.input)) {
    const items = Array.isArray(value)
      ? value
      : moduleValueAsString(value).split(',')
    return [
      ...new Set(
        items
          .map((item) => canonicalFieldOption(field.key, item.trim()))
          .filter(Boolean),
      ),
    ]
  }
  const text = emptyToNull(value)
  if (text == null) return null
  if (isBooleanInput(field.input)) return text === 'true'
  if (JSON_FIELD_KEYS.has(field.key)) {
    return JSON.parse(text) as unknown
  }
  if (field.input === '实体版本引用') {
    try {
      const reference: unknown = JSON.parse(text)
      return reference && typeof reference === 'object' ? reference : null
    } catch {
      return null
    }
  }
  if (isStructuredInput(field.input)) {
    return structuredPayload(field.key, text, structuredContext)
  }
  if (field.key === 'occurred_at') return toIsoDateTime(text)
  if (field.key === 'chemical_formula') return normalizeChemicalFormula(text)
  if (field.input === '数值') {
    return assertValidNumber(text, field.key, field.validation)
  }
  if (isCompositeInput(field.input)) {
    const options =
      parseEnumOptions(field.input, field.options, field.key) ??
      parseCompositeOptions(field.options).map((item) =>
        canonicalFieldOption(field.key, item),
      )
    const parsed = parseCompositeValue(field.input, text, options)
    return {
      value: field.input.includes('数值')
        ? parsed.freeValue.trim() === ''
          ? null
          : assertValidNumber(parsed.freeValue, field.key, field.validation)
        : parsed.freeValue,
      option: parsed.option || null,
    }
  }
  if (/(下拉|多选)/.test(field.input)) {
    return canonicalFieldOption(field.key, text)
  }
  return text
}

/** 一行是否有实质内容（重复条目：过滤全空行，避免夹带空条目触发后端必填校验）。 */
export function itemHasAnyValue(values: ModuleValues): boolean {
  return Object.entries(values).some(
    ([key, value]) => key !== 'source_id' && !moduleValueIsEmpty(value),
  )
}

/** 单条重复条目（precursors / substrates）的 payload：下发该模块全部字段键。 */
export function buildItemPayload(
  moduleKey: string,
  values: ModuleValues,
): Record<string, unknown> {
  const item: Record<string, unknown> = {}
  for (const field of getModuleFields(moduleKey)) {
    item[field.key] = isFieldVisible(moduleKey, field, values)
      ? fieldValueToPayload(field, values[field.key], {
          loadingMethod: moduleValueAsString(values['loading_method']),
        })
      : null
  }
  if (moduleKey === 'substrates' && values['source_id']) {
    item['source_id'] = moduleValueAsString(values['source_id'])
  }
  return item
}

/** 重复条目模块（precursors / substrates）的 payload：{ items: [...] }，过滤全空行。 */
export function buildItemsModulePayload(
  moduleKey: string,
  items: ModuleValues[],
): { items: Record<string, unknown>[] } {
  return {
    items: items
      .filter(itemHasAnyValue)
      .map((values) => buildItemPayload(moduleKey, values)),
  }
}

/** 空模块取值（多值字段置空数组，其余字段置空串）。 */
export function emptyModuleValues(moduleKey: string): ModuleValues {
  const values: ModuleValues = {}
  for (const field of getModuleFields(moduleKey)) {
    values[field.key] = isMultiValueInput(field.input) ? [] : ''
  }
  return values
}

/** 从后端读回的 payload_json 还原扁平模块取值（缺失键补空串）。 */
export function moduleValuesFromPayload(
  moduleKey: string,
  payload: Record<string, unknown> | null | undefined,
): ModuleValues {
  const values = emptyModuleValues(moduleKey)
  if (!payload) return values
  for (const field of getModuleFields(moduleKey)) {
    const raw = payload[field.key]
    if (
      raw != null &&
      field.input === '实体版本引用' &&
      typeof raw === 'object'
    ) {
      values[field.key] = JSON.stringify(raw)
    } else if (raw != null && JSON_FIELD_KEYS.has(field.key)) {
      const normalized =
        field.key === 'pretreatment_steps' && Array.isArray(raw)
          ? raw.map((step) =>
              step && typeof step === 'object' && 'type' in step
                ? {
                    ...step,
                    type: canonicalFieldOption(
                      'type',
                      String((step as Record<string, unknown>).type ?? ''),
                    ),
                  }
                : step,
            )
          : raw
      values[field.key] = JSON.stringify(normalized)
    } else if (raw != null && isBooleanInput(field.input)) {
      values[field.key] = raw === true ? 'true' : 'false'
    } else if (
      raw != null &&
      isStructuredInput(field.input) &&
      typeof raw === 'object'
    ) {
      values[field.key] = structuredValueFromRaw(field.key, raw)
    } else if (
      raw != null &&
      isCompositeInput(field.input) &&
      typeof raw === 'object'
    ) {
      const composite = raw as { value?: unknown; option?: unknown }
      values[field.key] = formatCompositeValue(
        field.input,
        composite.value == null ? '' : String(composite.value),
        composite.option == null ? '' : String(composite.option),
      )
    } else if (raw != null && field.key === 'occurred_at') {
      values[field.key] = isoToDateTimeLocal(String(raw))
    } else if (raw != null && isMultiValueInput(field.input)) {
      const items = Array.isArray(raw) ? raw : [raw]
      values[field.key] = items
        .map((item) => canonicalFieldOption(field.key, String(item)))
        .filter(Boolean)
    } else if (raw != null && /(下拉|多选)/.test(field.input)) {
      values[field.key] = canonicalFieldOption(field.key, String(raw))
    } else {
      values[field.key] = raw == null ? '' : String(raw)
    }
  }
  return values
}

/** 从历史 payload 读回 components 数组，不再用于当前写路径。 */
export function componentsFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ComponentRow[] {
  const raw = payload?.['components']
  if (!Array.isArray(raw)) return []
  const structureType = canonicalOption(
    String(payload?.['structure_type'] ?? ''),
  )
  return raw
    .filter((item) => {
      if (structureType !== 'doped') return true
      const row = (item ?? {}) as Record<string, unknown>
      return canonicalOption(String(row['role'] ?? '')) !== 'matrix'
    })
    .map((item) => {
      const row = (item ?? {}) as Record<string, unknown>
      const pick = (key: string) => (row[key] == null ? '' : String(row[key]))
      return {
        formula: pick('formula'),
        role: canonicalOption(pick('role')),
        concentration_at_percent: pick('concentration_at_percent'),
        layer_order: pick('layer_order'),
        bulk_space_group: pick('bulk_space_group'),
      }
    })
}

/** 从后端读回的 items 数组还原重复条目取值。 */
export function itemsFromPayload(
  moduleKey: string,
  payload: Record<string, unknown> | null | undefined,
): ModuleValues[] {
  const raw = payload?.['items']
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const payloadItem = (item ?? {}) as Record<string, unknown>
    const values = moduleValuesFromPayload(moduleKey, payloadItem)
    if (moduleKey === 'substrates' && payloadItem['source_id'] != null) {
      values['source_id'] = String(payloadItem['source_id'])
    }
    return values
  })
}
