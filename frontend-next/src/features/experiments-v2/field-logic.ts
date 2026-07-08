// v2 实验录入表单的「元数据驱动」纯逻辑：模块字段取用、条件显隐、有效必填、
// 组分角色解析、提交载荷组装。全部只读消费 field-metadata（生成物），不含 React/网络，
// 便于 vitest 单测。payload 键一律取字段 key（D10 契约）。
//
// 与后端契约对齐（backend/app/schemas/generated/v2_module_payload.py）：
//  - 各模块 payload 用 `extra="forbid"` + 必填键必须在场 → 扁平模块提交时下发全部字段键
//    （空值下发 null），保证 required 键在场且不夹带 schema 之外的键。
//  - target_product.components / precursors.items / substrates.items 的条件必填由生成的
//    model_validator 强制；前端此处复刻同一判据用于动态红星与提交前拦截。
import { experimentModules } from '@/shared/generated/field-metadata'
import type {
  FieldCondition,
  FieldMetadata,
} from '@/shared/generated/field-metadata'
import {
  matchesCondition,
  parseEnumOptions,
} from '@/features/entity-library/field-logic'

export { matchesCondition, parseEnumOptions }

/** 单条模块的表单取值：统一以字符串承载（组件层），提交时转成 string | null。 */
export type ModuleValues = Record<string, string>

/** §1b 组成明细的一行（键与后端 formula_display.py 读取的键对齐）。 */
export interface ComponentRow {
  formula: string
  role: string
  concentration_at_percent: string
  layer_order: string
}

/** 本步实现的模块键（§1–§4）。§5–§8 由下一步实现，此处仅占位。 */
export const IMPLEMENTED_MODULE_KEYS = [
  'basic_info',
  'target_product',
  'equipment',
  'precursors',
  'substrates',
] as const
export type ImplementedModuleKey = (typeof IMPLEMENTED_MODULE_KEYS)[number]

/** §5–§8 占位模块键（下一步落地）。 */
export const PLACEHOLDER_MODULE_KEYS = [
  'process_steps',
  'process_events',
  'pvd',
] as const

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
  const driver = values[refKey] ?? ''
  if (driver === '') return false
  return matchesCondition(condition, driver)
}

/**
 * 可见性受条件门控的字段键：仅在条件成立时显示。
 *  - components：结构类型≠本征 才显示编辑器；
 *  - appearance：相态=固 才显示（推荐项）；
 *  - oxide_thickness_nm：衬底材料=SiO₂/Si 才显示（并必填）。
 * 注意 amount（用量）不在此列——它恒显示，仅红星随相态动态出现。
 */
const VISIBILITY_GATED_KEYS = new Set([
  'components',
  'appearance',
  'oxide_thickness_nm',
])

export function isFieldVisible(
  moduleKey: string,
  field: FieldMetadata,
  values: ModuleValues,
): boolean {
  if (!VISIBILITY_GATED_KEYS.has(field.key)) return true
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

/**
 * 从 components 字段的 options 描述里解析「角色」枚举，保持来自元数据（单一源）。
 * 例：'每条:化学式/角色(基体·掺杂剂·上层·下层·横向域)/浓度(at%)/层序(整数)'
 *   → ['基体','掺杂剂','上层','下层','横向域']
 */
export function parseComponentRoles(options: string | null): string[] {
  if (!options) return []
  const match = options.match(/角色[（(]([^）)]+)[）)]/)
  if (!match) return []
  return match[1]
    .split('·')
    .map((token) => token.trim())
    .filter(Boolean)
}

/** components 字段的角色枚举（从生成物解析，供 §1b 组分编辑器下拉使用）。 */
export function getComponentRoleOptions(): string[] {
  const field = getModuleFields('target_product').find(
    (item) => item.key === 'components',
  )
  return parseComponentRoles(field?.options ?? null)
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** 一行组分是否有实质内容（至少填了化学式）。 */
export function isNonEmptyComponent(row: ComponentRow): boolean {
  return row.formula.trim() !== ''
}

function toComponentObject(row: ComponentRow): Record<string, string | null> {
  return {
    formula: emptyToNull(row.formula),
    role: emptyToNull(row.role),
    concentration_at_percent: emptyToNull(row.concentration_at_percent),
    layer_order: emptyToNull(row.layer_order),
  }
}

/** 扁平模块（如 basic_info）的 payload：下发全部字段键（空值 null），满足 extra=forbid + 必填在场。 */
export function buildFlatModulePayload(
  moduleKey: string,
  values: ModuleValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of getModuleFields(moduleKey)) {
    payload[field.key] = emptyToNull(values[field.key])
  }
  return payload
}

/**
 * §1b target_product payload：扁平字段 + components 数组。
 * 结构类型=本征 或未选时不下发 components（置 null），与后端「本征无组成明细」一致。
 */
export function buildTargetProductPayload(
  values: ModuleValues,
  components: ComponentRow[],
): Record<string, unknown> {
  const structureType = values['structure_type'] ?? ''
  const active = structureType !== '' && structureType !== '本征'
  const rows = active
    ? components.filter(isNonEmptyComponent).map(toComponentObject)
    : []
  const payload: Record<string, unknown> = {}
  for (const field of getModuleFields('target_product')) {
    if (field.key === 'components') {
      payload.components = rows.length > 0 ? rows : null
    } else {
      payload[field.key] = emptyToNull(values[field.key])
    }
  }
  return payload
}

/** 一行是否有实质内容（重复条目：过滤全空行，避免夹带空条目触发后端必填校验）。 */
export function itemHasAnyValue(values: ModuleValues): boolean {
  return Object.values(values).some((value) => value.trim() !== '')
}

/** 单条重复条目（precursors / substrates）的 payload：下发该模块全部字段键。 */
export function buildItemPayload(
  moduleKey: string,
  values: ModuleValues,
): Record<string, unknown> {
  const item: Record<string, unknown> = {}
  for (const field of getModuleFields(moduleKey)) {
    item[field.key] = emptyToNull(values[field.key])
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

/**
 * 提交前拦截：返回该模块内「可见 + 有效必填 + 空」的字段键清单（非空即校验通过）。
 * 组件层用它阻断保存并高亮缺失项，避免直接把后端 422 抛给用户。
 */
export function missingRequiredKeys(
  moduleKey: string,
  values: ModuleValues,
): string[] {
  const missing: string[] = []
  for (const field of getModuleFields(moduleKey)) {
    if (!isFieldVisible(moduleKey, field, values)) continue
    if (!isEffectivelyRequired(moduleKey, field, values)) continue
    if ((values[field.key] ?? '').trim() === '') missing.push(field.key)
  }
  return missing
}

/** 空模块取值（所有字段键置空串）。 */
export function emptyModuleValues(moduleKey: string): ModuleValues {
  const values: ModuleValues = {}
  for (const field of getModuleFields(moduleKey)) values[field.key] = ''
  return values
}

/** 空组分行。 */
export function emptyComponentRow(): ComponentRow {
  return {
    formula: '',
    role: '',
    concentration_at_percent: '',
    layer_order: '',
  }
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
    values[field.key] = raw == null ? '' : String(raw)
  }
  return values
}

/** 从后端读回的 components 数组还原组分行。 */
export function componentsFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ComponentRow[] {
  const raw = payload?.['components']
  if (!Array.isArray(raw)) return []
  return raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>
    const pick = (key: string) => (row[key] == null ? '' : String(row[key]))
    return {
      formula: pick('formula'),
      role: pick('role'),
      concentration_at_percent: pick('concentration_at_percent'),
      layer_order: pick('layer_order'),
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
  return raw.map((item) =>
    moduleValuesFromPayload(moduleKey, (item ?? {}) as Record<string, unknown>),
  )
}
