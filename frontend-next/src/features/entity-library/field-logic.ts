// 一等实体表单的「元数据驱动」纯逻辑：可选项解析、条件显隐、有效必填、默认值。
// 全部只读消费 field-metadata（生成物），不含 React/网络，便于 vitest 单测。
import { entities } from '@/shared/generated/field-metadata'
import {
  formatCompositeValue,
  isCompositeInput,
  parseCompositeOptions,
  parseCompositeValue,
} from '@/shared/composite-field'
import type {
  FieldCondition,
  FieldMetadata,
} from '@/shared/generated/field-metadata'
import { canonicalOption } from '@/shared/field-i18n'
import type { EntityKind } from './config'
import {
  isStructuredInput,
  structuredPayload,
  structuredValueFromRaw,
} from '@/shared/structured-field'
import { assertValidNumber } from '@/shared/field-validation'
import {
  entityFileFormValue,
  entityFilePayload,
  isEntityFileInput,
} from '@/shared/entity-file-reference'

export type EntityFieldValue = string | string[]
export type EntityFormValues = Record<string, EntityFieldValue>
export type EntityVersionPayload = Record<string, unknown>

/**
 * 版本号由后端版本表自增分配（V2EntityVersionRead.version），不是用户录入项，
 * 故从可编辑表单字段中剔除；列表/详情改用后端返回的 version 展示。
 */
export const SYSTEM_FIELD_KEYS = new Set(['version'])

/** 该实体的「可编辑」注册字段（剔除系统托管字段）。 */
export function getEntityFields(kind: EntityKind): FieldMetadata[] {
  return entities[kind].filter((field) => !SYSTEM_FIELD_KEYS.has(field.key))
}

/** 只由字段声明的 input 形态决定是否解析枚举。 */
export function parseEnumOptions(
  input: string,
  options: string | null,
): string[] | null {
  if (!/(下拉|多选)/.test(input) || !options) return null
  if (isCompositeInput(input)) {
    return parseCompositeOptions(options).map(canonicalOption)
  }
  const separator = options.includes('·') ? '·' : '/'
  const tokens = options
    .split(separator)
    .map((token) => token.trim())
    .filter(Boolean)
  return tokens.length ? tokens.map(canonicalOption) : null
}

export function isSelectWithOtherInput(input: string): boolean {
  return /下拉\+其他/.test(input)
}

export function isMultiSelectInput(input: string): boolean {
  return /多选/.test(input)
}

export function isOtherOptionMarker(option: string): boolean {
  option = canonicalOption(option)
  return (
    option === 'controlled_or_other' ||
    option === 'other' ||
    option === 'other_addable'
  )
}

export function isNoneOption(option: string): boolean {
  return canonicalOption(option) === 'none'
}

/**
 * 子类分组编码在 labelZh 前缀 "▸<类别>·<字段>"（如 "▸衬底·材料"、"▸气瓶·纯度等级"）。
 * 返回类别名（衬底 / 气瓶 …）或 null。
 */
export function parseSubcategory(labelZh: string): string | null {
  const match = labelZh.match(/^▸([^·]+)·/)
  return match ? match[1] : null
}

/**
 * 找到「类别驱动字段」的键。子类字段自带显式 eq 条件（如 ▸衬底·材料 的
 * requirement.condition = {批次类别 eq 衬底}），故直接反查「带 value===子类名 的 eq 条件」
 * 的字段，取其条件引用键即驱动键——由声明的条件推导，不靠枚举 token 匹配启发式。
 */
function findCategoryDriverKey(
  kind: EntityKind,
  subcategory: string,
): string | null {
  for (const field of entities[kind]) {
    const condition = field.requirement.condition
    if (
      condition?.op === 'eq' &&
      condition.value === canonicalOption(subcategory)
    ) {
      return resolveConditionKey(kind, condition.field)
    }
  }
  return null
}

/**
 * 把条件里的字段引用（如 'MaterialLot.批次类别' / 'MaterialLot.▸衬底·材料'）解析为字段键。
 * 引用格式 = "<前缀>.<被引用字段的 labelZh>"，取第一个 '.' 之后的部分与 labelZh 匹配。
 */
export function resolveConditionKey(
  kind: EntityKind,
  conditionField: string,
): string | null {
  const label = conditionField.slice(conditionField.indexOf('.') + 1)
  const field = entities[kind].find((item) => item.labelZh === label)
  return field?.key ?? null
}

export function matchesCondition(
  condition: FieldCondition,
  value: unknown,
): boolean {
  if (
    value == null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return false
  }
  const expected = Array.isArray(condition.value)
    ? condition.value.map(canonicalOption)
    : canonicalOption(condition.value)
  const actual = Array.isArray(value)
    ? value.map((item) => canonicalOption(String(item)))
    : typeof value === 'string'
      ? canonicalOption(value)
      : value
  if (Array.isArray(actual)) {
    switch (condition.op) {
      case 'eq':
        return actual.includes(expected)
      case 'ne':
        return !actual.includes(expected)
      case 'in':
        return Array.isArray(expected)
          ? actual.some((item) => expected.includes(item))
          : false
    }
  }
  switch (condition.op) {
    case 'eq':
      return actual === expected
    case 'ne':
      return actual !== expected
    case 'in':
      return Array.isArray(expected)
        ? expected.some((item) => item === actual)
        : false
    default:
      console.error(`Unsupported condition op: ${condition.op}`)
      return false
  }
}

/**
 * 字段是否应显示：
 *  1) 子类前缀（▸衬底·/▸气瓶·）→ 需驱动字段（批次类别）取值等于该子类；
 *  2) 元数据显式条件（requirement.condition）→ 需条件成立。
 * 二者皆满足（或不适用）才显示。无法解析的引用按「条件不成立」兜底。
 */
export function isFieldVisible(
  kind: EntityKind,
  field: FieldMetadata,
  values: EntityFormValues,
): boolean {
  const subcategory = parseSubcategory(field.labelZh)
  if (subcategory) {
    const driverKey = findCategoryDriverKey(kind, subcategory)
    if (
      driverKey &&
      canonicalOption(String(values[driverKey] ?? '')) !==
        canonicalOption(subcategory)
    )
      return false
  }

  const condition = field.requirement.condition
  if (condition) {
    const refKey = resolveConditionKey(kind, condition.field)
    if (!refKey || !matchesCondition(condition, values[refKey])) return false
  }

  return true
}

/**
 * 字段在当前取值下是否「有效必填」：
 *  - required 恒必填；
 *  - conditional_required 仅在当前可见时必填（可见已隐含其条件成立）。
 * 其余级别（recommended / optional / definition / none / …）均非必填。
 */
export function isEffectivelyRequired(
  kind: EntityKind,
  field: FieldMetadata,
  values: EntityFormValues,
): boolean {
  const level = field.requirement.level
  if (level === 'required') return true
  if (level === 'conditional_required') {
    return isFieldVisible(kind, field, values)
  }
  return false
}

/** 建立表单默认值：多选保留数组，其余字段使用字符串。 */
export function buildDefaultValues(
  kind: EntityKind,
  source?: Record<string, unknown> | null,
): EntityFormValues {
  const values: EntityFormValues = {}
  for (const field of getEntityFields(kind)) {
    const raw = source?.[field.key]
    if (isMultiSelectInput(field.input)) {
      values[field.key] = Array.isArray(raw)
        ? raw.map(String).filter(Boolean).map(canonicalOption)
        : raw == null || raw === ''
          ? []
          : [canonicalOption(String(raw))]
    } else if (
      raw != null &&
      isEntityFileInput(field.input) &&
      typeof raw === 'object'
    ) {
      values[field.key] = entityFileFormValue(raw, field.key)
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
    } else {
      values[field.key] =
        raw == null
          ? ''
          : /下拉/.test(field.input)
            ? canonicalOption(String(raw))
            : String(raw)
    }
  }
  return values
}

/**
 * 提交载荷：只取「当前可见 + 非空」字段，按字段键组装。隐藏字段与空值一律剔除，
 * 避免把（因显隐切换而残留的）过时值写入新版本快照。
 */
export function buildSubmitPayload(
  kind: EntityKind,
  values: EntityFormValues,
): EntityVersionPayload {
  const payload: EntityVersionPayload = {}
  for (const field of getEntityFields(kind)) {
    if (!isFieldVisible(kind, field, values)) continue
    const value = values[field.key]
    if (Array.isArray(value)) {
      const normalized = [
        ...new Set(
          value.map((item) => canonicalOption(item.trim())).filter(Boolean),
        ),
      ]
      if (normalized.length > 0) payload[field.key] = normalized
      continue
    }
    const normalized = (value ?? '').trim()
    if (normalized) {
      if (isEntityFileInput(field.input)) {
        payload[field.key] = entityFilePayload(normalized, field.key)
      } else if (isStructuredInput(field.input)) {
        payload[field.key] = structuredPayload(field.key, normalized)
      } else if (isCompositeInput(field.input)) {
        const options = parseCompositeOptions(field.options).map(
          canonicalOption,
        )
        const parsed = parseCompositeValue(field.input, normalized, options)
        payload[field.key] = {
          value: field.input.includes('数值')
            ? parsed.freeValue.trim() === ''
              ? null
              : assertValidNumber(parsed.freeValue, field.key, field.validation)
            : parsed.freeValue || null,
          option: parsed.option || null,
        }
      } else {
        payload[field.key] =
          field.input === '数值'
            ? assertValidNumber(normalized, field.key, field.validation)
            : /(下拉|多选)/.test(field.input)
              ? canonicalOption(normalized)
              : normalized
      }
    }
  }
  return payload
}
