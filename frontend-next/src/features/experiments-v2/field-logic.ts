// v2 实验录入表单的「元数据驱动」纯逻辑：模块字段取用、条件显隐、有效必填、
// 组分角色解析、提交载荷组装。全部只读消费 field-metadata（生成物），不含 React/网络，
// 便于 vitest 单测。payload 键一律取字段 key（D10 契约）。
//
// 与后端契约对齐（backend/app/schemas/generated/v2_module_payload.py）：
//  - 各模块 payload 用 `extra="forbid"` + 必填键必须在场 → 扁平模块提交时下发全部字段键
//    （空值下发 null），保证 required 键在场且不夹带 schema 之外的键。
//  - target_product.components / precursors.items / substrates.items 的条件必填由生成的
//    model_validator 强制；前端此处复刻同一判据用于动态红星与保存前拦截。
import {
  experimentModules,
  stageTypes,
} from '@/shared/generated/field-metadata'
import type {
  FieldCondition,
  FieldMetadata,
  StageType,
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
import { normalizeChemicalFormula, renderFormulaDisplay } from './formula'
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

/** §1b 组成明细的一行。 */
export interface ComponentRow {
  formula: string
  role: string
  concentration_at_percent: string
  layer_order: string
  bulk_space_group?: string
}

const STRUCTURE_GUIDES = {
  intrinsic: 'experimentsV2.sections.targetProduct.guides.intrinsic',
  doped: 'experimentsV2.sections.targetProduct.guides.doped',
  alloy: 'experimentsV2.sections.targetProduct.guides.alloy',
  vertical_heterostructure:
    'experimentsV2.sections.targetProduct.guides.vertical',
  lateral_heterostructure:
    'experimentsV2.sections.targetProduct.guides.lateral',
  other: 'experimentsV2.sections.targetProduct.guides.other',
} as const

export function structureGuideKey(structureType: string) {
  return STRUCTURE_GUIDES[
    canonicalOption(structureType) as keyof typeof STRUCTURE_GUIDES
  ]
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
 * 例：'每条:化学式/角色(基体·掺杂剂·合金组分·上层·下层·横向域)/浓度(at%)/层序(整数)'
 *   → ['基体','掺杂剂','合金组分','上层','下层','横向域']
 */
export function parseComponentRoles(options: string | null): string[] {
  if (!options) return []
  const match = options.match(/角色[（(]([^）)]+)[）)]/)
  if (!match) return []
  return match[1]
    .split('·')
    .map((token) => token.trim())
    .filter(Boolean)
    .map(canonicalOption)
}

/** components 字段的角色枚举（从生成物解析，供 §1b 组分编辑器下拉使用）。 */
export function getComponentRoleOptions(): string[] {
  const field = getModuleFields('target_product').find(
    (item) => item.key === 'components',
  )
  return parseComponentRoles(field?.options ?? null)
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

function finiteNumber(value: string, fieldKey: string): number {
  return assertValidNumber(value, fieldKey, null)
}

function requiredFieldValueIsMissing(
  field: FieldMetadata,
  value: ModuleFieldValue | undefined,
): boolean {
  if (moduleValueIsEmpty(value)) return true
  if (field.input === '复选确认') {
    return moduleValueAsString(value) !== 'true'
  }
  if (JSON_FIELD_KEYS.has(field.key)) {
    try {
      const parsed: unknown = JSON.parse(moduleValueAsString(value))
      return parsed == null || (Array.isArray(parsed) && parsed.length === 0)
    } catch {
      return true
    }
  }
  if (!isCompositeInput(field.input)) return false
  const text = moduleValueAsString(value)
  const options =
    parseEnumOptions(field.input, field.options, field.key) ??
    parseCompositeOptions(field.options).map((item) =>
      canonicalFieldOption(field.key, item),
    )
  const parsed = parseCompositeValue(field.input, text, options)
  return Boolean(
    (field.validation?.require_value && !parsed.freeValue.trim()) ||
    (field.validation?.require_option && !parsed.option),
  )
}

/** 一行组分是否有实质内容（至少填了化学式）。 */
export function isNonEmptyComponent(row: ComponentRow): boolean {
  return row.formula.trim() !== ''
}

function numericOrNull(value: string, fieldKey: string): number | null {
  const text = emptyToNull(value)
  return text == null ? null : finiteNumber(text, fieldKey)
}

function toComponentObject(
  row: ComponentRow,
  structureType: string,
  index: number,
): Record<string, unknown> {
  const keepsConcentration =
    structureType === 'doped' ||
    structureType === 'alloy' ||
    structureType === 'other'
  const keepsLayerOrder =
    structureType === 'vertical_heterostructure' || structureType === 'other'
  const defaultRole =
    structureType === 'doped'
      ? 'dopant'
      : structureType === 'alloy'
        ? 'alloy_component'
        : structureType === 'vertical_heterostructure'
          ? 'material_layer'
          : structureType === 'lateral_heterostructure'
            ? 'lateral_domain'
            : null
  return {
    formula: normalizeChemicalFormula(row.formula),
    role:
      structureType === 'other' && row.role.trim()
        ? canonicalOption(row.role.trim())
        : defaultRole,
    concentration_at_percent: keepsConcentration
      ? numericOrNull(row.concentration_at_percent, 'concentration_at_percent')
      : null,
    layer_order: keepsLayerOrder
      ? structureType === 'vertical_heterostructure'
        ? index + 1
        : numericOrNull(row.layer_order, 'layer_order')
      : null,
    bulk_space_group: [
      'vertical_heterostructure',
      'lateral_heterostructure',
    ].includes(structureType)
      ? numericOrNull(row.bulk_space_group ?? '', 'bulk_space_group')
      : null,
  }
}

/** 扁平模块（如 basic_info）的 payload：下发全部字段键（空值 null），满足 extra=forbid + 必填在场。 */
export function buildFlatModulePayload(
  moduleKey: string,
  values: ModuleValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of getModuleFields(moduleKey)) {
    payload[field.key] = isFieldVisible(moduleKey, field, values)
      ? fieldValueToPayload(field, values[field.key])
      : null
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
  const structureType = canonicalOption(
    moduleValueAsString(values['structure_type']),
  )
  const active =
    structureType !== '' &&
    structureType !== 'intrinsic' &&
    structureType !== '本征'
  const componentRows = active
    ? components
        .filter(isNonEmptyComponent)
        .map((row, index) => toComponentObject(row, structureType, index))
    : []
  const chemicalFormula = moduleValueAsString(values['chemical_formula'])
  const rows =
    structureType === 'doped' && chemicalFormula.trim()
      ? [
          {
            formula: normalizeChemicalFormula(chemicalFormula),
            role: 'matrix',
            concentration_at_percent: null,
            layer_order: null,
            bulk_space_group: null,
          },
          ...componentRows,
        ]
      : componentRows
  const storedFormula = [
    'vertical_heterostructure',
    'lateral_heterostructure',
  ].includes(structureType)
    ? renderFormulaDisplay('', structureType, rows)
    : chemicalFormula
  const payload: Record<string, unknown> = {}
  for (const field of getModuleFields('target_product')) {
    if (field.key === 'components') {
      payload.components = rows.length > 0 ? rows : null
    } else if (field.key === 'chemical_formula') {
      payload.chemical_formula = normalizeChemicalFormula(storedFormula)
    } else {
      payload[field.key] = fieldValueToPayload(field, values[field.key])
    }
  }
  return payload
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

/**
 * 保存前拦截：返回该模块内「可见 + 有效必填 + 空」的字段键清单（非空即校验通过）。
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
    if (requiredFieldValueIsMissing(field, values[field.key])) {
      missing.push(field.key)
    }
  }
  return missing
}

/** 空模块取值（多值字段置空数组，其余字段置空串）。 */
export function emptyModuleValues(moduleKey: string): ModuleValues {
  const values: ModuleValues = {}
  for (const field of getModuleFields(moduleKey)) {
    values[field.key] = isMultiValueInput(field.input) ? [] : ''
  }
  return values
}

/** 空组分行。 */
export function emptyComponentRow(): ComponentRow {
  return {
    formula: '',
    role: '',
    concentration_at_percent: '',
    layer_order: '',
    bulk_space_group: '',
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

/** 从后端读回的 components 数组还原组分行。 */
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
    if (
      moduleKey === 'substrates' &&
      payloadItem['axial_position_mm'] != null
    ) {
      values['axial_position_mm'] = String(payloadItem['axial_position_mm'])
    }
    return values
  })
}

// ════════════════════════════════════════════════════════════════════════
// §5 过程步（D11 数据驱动）：阶段类型 → 参数组显隐/必填 + discriminated union 载荷。
// 「阶段类型→参数组」映射 = 生成物 stageTypes（YAML `stage_types` 节，与后端 union
// 生成器同源）。改映射改 YAML 再重跑 gen:fields，勿在此散写「某阶段显示某字段」。
// ════════════════════════════════════════════════════════════════════════

/** common 参数组恒显；其余组按阶段 shows 出现。 */
const COMMON_GROUP = 'common'
const EXTERNAL_FIELD_GROUP = 'external_field'

/** 按阶段类型名取 stageTypes 定义（未知阶段返回 undefined）。 */
export function getStageType(name: string): StageType | undefined {
  const code = canonicalOption(name)
  return stageTypes.find((stage) => stage.name === code)
}

export function isRetiredProcessStage(name: string): boolean {
  return name.trim() !== '' && getStageType(name) == null
}

/** 该阶段可见的参数组集合（common 恒含 + shows）。未知阶段仅 common。 */
export function visibleGroupsForStage(name: string): Set<string> {
  const stage = getStageType(name)
  return new Set<string>([COMMON_GROUP, ...(stage?.shows ?? [])])
}

/**
 * 被引用 Setup 快照是否带外场装置（field_devices≠无）。跨实体条件：从表单已存的 setup
 * 快照读（form-state 已把 attrs_snapshot 摊平为直取键，故直接读 field_devices）。
 */
export function hasExternalFieldSetup(
  snapshot: Record<string, unknown> | null | undefined,
): boolean {
  if (!snapshot) return false
  const value = snapshot['field_devices']
  if (value == null || value === '' || value === 'none' || value === '无')
    return false
  if (Array.isArray(value)) {
    return (
      value.length > 0 &&
      !(value.length === 1 && (value[0] === 'none' || value[0] === '无'))
    )
  }
  return true
}

/**
 * 过程步字段在给定阶段下是否显示：
 *  - common 恒显；
 *  - 其余组仅当阶段 shows 含该组；
 *  - 外场组额外要求「§2 已选 Setup 且快照 field_devices≠无」（跨实体条件）。
 * 阶段未选时仅 common 组可见（UI 先只露阶段类型选择器）。
 */
export function isProcessStepFieldVisible(
  field: FieldMetadata,
  stageType: string,
  setupSnapshot: Record<string, unknown> | null | undefined,
  step?: ModuleValues,
): boolean {
  const group = field.group ?? COMMON_GROUP
  if (group === COMMON_GROUP) return true
  if (!stageType) return false
  if (!visibleGroupsForStage(stageType).has(group)) return false
  if (group === EXTERNAL_FIELD_GROUP)
    return hasExternalFieldSetup(setupSnapshot)
  if (field.key === 'other_gas_name' && field.requirement.condition) {
    return step
      ? isConditionSatisfied(field.requirement.condition, step, 'process_steps')
      : true
  }
  return true
}

/**
 * 过程步字段在当前阶段下是否有效必填（驱动红星）：
 *  - required 恒必填；
 *  - conditional_required：阶段 requiredExtra 命中（如反应生长的反应压力条件）或字段自身条件成立
 *    （降温组=降温段、外场组=Setup有外场）。
 * 全部数据驱动：requiredExtra 来自 stageTypes，条件来自字段元数据。
 */
export function isProcessStepFieldRequired(
  field: FieldMetadata,
  stageType: string,
  setupSnapshot: Record<string, unknown> | null | undefined,
  step?: ModuleValues,
): boolean {
  const level = field.requirement.level
  if (level === 'required') return true
  if (level !== 'conditional_required') return false
  const stage = getStageType(stageType)
  if (stage?.requiredExtra?.includes(field.key)) return true
  const condition = field.requirement.condition
  if (!condition) return false
  if ((field.group ?? COMMON_GROUP) === EXTERNAL_FIELD_GROUP) {
    return hasExternalFieldSetup(setupSnapshot)
  }
  const driverKey = resolveModuleConditionKey('process_steps', condition.field)
  return driverKey === 'stage_type'
    ? matchesCondition(condition, stageType)
    : step
      ? isConditionSatisfied(condition, step, 'process_steps')
      : false
}

/** 一条过程步是否已选阶段类型（判定是否纳入保存/校验）。 */
export function isProcessStepActive(step: ModuleValues): boolean {
  return moduleValueAsString(step['stage_type']).trim() !== ''
}

export function processStepOrderIsValid(steps: ModuleValues[]): boolean {
  const primaryStages = steps
    .map((step) =>
      canonicalOption(moduleValueAsString(step['stage_type']).trim()),
    )
    .filter(
      (stage) => stage === 'preparation' || stage === 'reaction_conditions',
    )
  return (
    !primaryStages.includes('preparation') ||
    !primaryStages.includes('reaction_conditions') ||
    primaryStages.indexOf('preparation') <
      primaryStages.indexOf('reaction_conditions')
  )
}

/**
 * 单条过程步 payload：stage_type + 该阶段允许的字段键（common ∪ shows 组）。
 * 键集与后端 discriminated union（同 stage_types 源生成）逐阶段对齐；未选阶段返回 null。
 */
export function buildProcessStepPayload(
  step: ModuleValues,
  setupSnapshot?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const stageType = canonicalOption(
    moduleValueAsString(step['stage_type']).trim(),
  )
  const stage = getStageType(stageType)
  if (!stageType) return null
  if (!stage) throw new RangeError(`Unknown process record type: ${stageType}`)
  const allowed = visibleGroupsForStage(stageType)
  const payload: Record<string, unknown> = {}
  for (const field of getModuleFields('process_steps')) {
    const group = field.group ?? COMMON_GROUP
    if (!allowed.has(group)) continue
    payload[field.key] =
      field.key === 'stage_type'
        ? stageType
        : isProcessStepFieldVisible(field, stageType, setupSnapshot, step)
          ? fieldValueToPayload(field, step[field.key])
          : null
  }
  return payload
}

/** §5 过程步模块 payload：{ items: [...] }，滤掉未选阶段的空步。 */
export function buildProcessStepsPayload(
  steps: ModuleValues[],
  setupSnapshot?: Record<string, unknown> | null,
): {
  items: Record<string, unknown>[]
} {
  const items: Record<string, unknown>[] = []
  for (const step of steps) {
    const payload = buildProcessStepPayload(step, setupSnapshot)
    if (payload) items.push(payload)
  }
  return { items }
}

/** 保存前拦截：一条过程步内「可见 + 有效必填 + 空」的字段键。 */
export function missingProcessStepKeys(
  step: ModuleValues,
  setupSnapshot: Record<string, unknown> | null | undefined,
): string[] {
  const stageType = moduleValueAsString(step['stage_type']).trim()
  const missing: string[] = []
  for (const field of getModuleFields('process_steps')) {
    if (!isProcessStepFieldVisible(field, stageType, setupSnapshot, step))
      continue
    if (!isProcessStepFieldRequired(field, stageType, setupSnapshot, step))
      continue
    if (requiredFieldValueIsMissing(field, step[field.key])) {
      missing.push(field.key)
    }
  }
  return missing
}
