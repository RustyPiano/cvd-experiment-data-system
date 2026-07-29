#!/usr/bin/env bun
// ============================================================================
// 生成器⑤（实现方案 D1 / D12）—— 前端 TS 字段元数据
//
// 读取字段【单一权威源】docs/standard/field-source.yaml，生成
//   src/shared/generated/field-metadata.ts（提交生成物）。
//
// ⚠️ 改字段只改 YAML，勿手改生成物。重新生成：
//     bun run gen:fields   （= 本脚本 + prettier；CI 有 drift 门禁）
//
// 输出确定性：字段按 YAML 源序，模块按首次出现序；同一输入逐字节相同
// （JSON.stringify 保插入序 + gen:fields 末尾统一过 prettier）。
//
// 本脚本是 bun 构建工具（用 Bun.YAML / Bun.write），不进应用 tsc/eslint。
// ============================================================================
import { join } from 'node:path'

const HERE = import.meta.dir
const SRC = join(HERE, '..', '..', 'docs', 'standard', 'field-source.yaml')
const OUT = join(HERE, '..', 'src', 'shared', 'generated', 'field-metadata.ts')

interface RawCondition {
  field: string
  op: string
  value: string | string[] | boolean
}
interface RawRequirement {
  raw: string
  level: string
  otherwise?: 'optional'
  condition?: RawCondition
}
interface RawValidation {
  type?: string
  ge?: number
  gt?: number
  le?: number
  lt?: number
  require_value?: boolean
  require_option?: boolean
  item_required?: string[]
  finite_value?: boolean
  [key: string]: unknown
}
interface RawField {
  module: string
  label: string
  label_en: string
  key: string
  input: string
  unit?: string
  options?: string
  requirement: RawRequirement
  r0?: boolean
  group?: string
  placeholder?: string
  placeholder_en?: string
  help?: string
  help_en?: string
  ui?: { visibility_gated?: boolean }
  validation?: RawValidation
}
interface RawSection {
  title: string
  fields: RawField[]
}
interface RawStageType {
  name: string
  shows?: string[]
  required_extra?: string[]
}
interface RawDoc {
  meta: { version: string; status: string }
  scientific_contract: { property_units: Record<string, string> }
  gas_species: Record<
    string,
    { label_zh: string; label_en: string; aliases: string[] }
  >
  characterization_properties: Record<
    string,
    { label_zh: string; label_en: string }
  >
  characterization_profiles: Record<
    string,
    {
      label_zh: string
      label_en: string
      instrument_required: boolean
      raw_files_required: boolean
      show_growth_presence: boolean
      raw_file_guidance_zh: string
      allowed_region_types: string[]
      condition_fields: Array<{
        key: string
        label_zh: string
        label_en: string
        value_type:
          | 'text'
          | 'number'
          | 'integer'
          | 'range'
          | 'size'
          | 'resolution'
        unit?: string
        components?: Array<{
          key: string
          label_zh: string
          label_en: string
        }>
      }>
      allowed_property_codes: string[]
      default_property_codes: string[]
      allowed_assertion_types: string[]
    }
  >
  modules: Record<string, string>
  entity_keys: Record<string, string>
  option_labels_en: Record<string, string>
  option_codes: Record<string, string | boolean>
  field_option_codes?: Record<string, Record<string, string>>
  preferred_option_labels_zh?: Record<string, string>
  unit_labels_en: Record<string, string>
  field_ui_defaults: {
    input_placeholder: string
    input_placeholder_en: string
    select_placeholder: string
    select_placeholder_en: string
  }
  stage_types: {
    groups: Record<string, string>
    types: RawStageType[]
  }
  experiment_record: { sections: RawSection[] }
  entities: { sections: RawSection[] }
}

// 占位符 — 表示"无"（xlsx 人读视图用），对元数据消费者归一为 null。
const dashToNull = (value: string | undefined): string | null =>
  value == null || value === '—' ? null : String(value)

interface FieldMetadata {
  key: string
  labelZh: string
  labelEn: string
  input: string
  unit: string | null
  options: string | null
  validation: RawValidation | null
  requirement: {
    raw: string
    level: string
    otherwise: 'optional' | null
    condition: RawCondition | null
  }
  r0: boolean
  group: string | null
  placeholderZh: string
  placeholderEn: string
  helpZh: string | null
  helpEn: string | null
  visibilityGated?: true
}

function toFieldMetadata(
  field: RawField,
  defaults: RawDoc['field_ui_defaults'],
  optionCodes: Record<string, string | boolean>,
): FieldMetadata {
  const req = field.requirement
  const condition = req.condition
    ? {
        field: req.condition.field,
        op: req.condition.op,
        value: Array.isArray(req.condition.value)
          ? req.condition.value.map((value) => optionCodes[value] ?? value)
          : typeof req.condition.value === 'string'
            ? (optionCodes[req.condition.value] ?? req.condition.value)
            : req.condition.value,
      }
    : null
  return {
    key: field.key,
    labelZh: field.label,
    labelEn: field.label_en,
    input: field.input,
    unit: dashToNull(field.unit),
    options: dashToNull(field.options),
    validation: field.validation ?? null,
    requirement: {
      raw: req.raw,
      level: req.level,
      otherwise: req.otherwise ?? null,
      condition,
    },
    r0: Boolean(field.r0),
    group: field.group ?? null,
    placeholderZh:
      field.placeholder ??
      (field.input.includes('下拉')
        ? defaults.select_placeholder
        : defaults.input_placeholder),
    placeholderEn:
      field.placeholder_en ??
      (field.input.includes('下拉')
        ? defaults.select_placeholder_en
        : defaults.input_placeholder_en),
    helpZh: dashToNull(field.help),
    helpEn: dashToNull(field.help_en),
    ...(field.ui?.visibility_gated ? { visibilityGated: true as const } : {}),
  }
}

function groupByModule(
  sections: RawSection[],
  moduleMap: Record<string, string>,
  defaults: RawDoc['field_ui_defaults'],
  optionCodes: Record<string, string | boolean>,
): Record<string, FieldMetadata[]> {
  const out: Record<string, FieldMetadata[]> = {}
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.requirement.level === 'none') continue
      const key = moduleMap[field.module]
      if (!key) {
        throw new Error(
          `模块 ${field.module} 未在 modules/entity_keys 映射中登记（字段 ${field.key}）`,
        )
      }
      ;(out[key] ??= []).push(toFieldMetadata(field, defaults, optionCodes))
    }
  }
  return out
}

interface StageType {
  name: string
  labelZh: string
  labelEn: string
  shows: string[]
  requiredExtra?: string[]
}

const raw = await Bun.file(SRC).text()
const doc = Bun.YAML.parse(raw) as RawDoc

const meta = {
  version: doc.meta.version,
  status: doc.meta.status,
  source: 'docs/standard/field-source.yaml',
}
const experimentModules = groupByModule(
  doc.experiment_record.sections,
  doc.modules,
  doc.field_ui_defaults,
  doc.option_codes,
)
const entities = groupByModule(
  doc.entities.sections,
  doc.entity_keys,
  doc.field_ui_defaults,
  doc.option_codes,
)
const stageGroups = doc.stage_types.groups
const stageTypes: StageType[] = doc.stage_types.types.map((type) => {
  const machineName = doc.option_codes[type.name] ?? type.name
  if (typeof machineName !== 'string') {
    throw new Error(`阶段类型 ${type.name} 的机器码必须是字符串`)
  }
  const out: StageType = {
    name: machineName,
    labelZh: type.name,
    labelEn: doc.option_labels_en[type.name] ?? type.name,
    shows: type.shows ?? [],
  }
  if (type.required_extra && type.required_extra.length > 0) {
    out.requiredExtra = type.required_extra
  }
  return out
})

function preferredOptionLabels(language: 'zh' | 'en'): Record<string, string> {
  const labels: Record<string, string> = {}
  for (const [labelZh, code] of Object.entries(doc.option_codes)) {
    if (typeof code !== 'string') continue
    if (labels[code] !== undefined) continue
    labels[code] =
      language === 'zh' ? labelZh : (doc.option_labels_en[labelZh] ?? labelZh)
  }
  if (language === 'zh') {
    Object.assign(labels, doc.preferred_option_labels_zh ?? {})
  }
  return labels
}

const TYPES = `export interface FieldMetadataMeta {
  version: string
  status: string
  source: string
}

export type RequirementLevel =
  | 'required'
  | 'recommended'
  | 'optional'
  | 'definition'
  | 'none'
  | 'mixed'
  | 'conditional_required'
  | 'conditional_recommended'

export interface FieldCondition {
  field: string
  op: string
  value: string | string[] | boolean
}

export interface FieldRequirement {
  raw: string
  level: RequirementLevel
  otherwise: 'optional' | null
  condition: FieldCondition | null
}

export interface FieldValidation {
  /** 数值必须为整数；未指定时按有限浮点数处理。 */
  type?: 'integer' | string
  /** 含端点/不含端点的数值上下界。 */
  ge?: number
  gt?: number
  le?: number
  lt?: number
  /** 复合字段除选项外还必须提供 value。 */
  require_value?: boolean
  /** 数组条目必须具备的键。 */
  item_required?: string[]
  /** 数组条目的 value 必须为有限数。 */
  finite_value?: boolean
  /** 保留单一源未来增加的校验属性，不在生成时丢弃。 */
  [key: string]: unknown
}

export interface FieldMetadata {
  key: string
  labelZh: string
  labelEn: string
  /** 字段输入形态（原样透传自 field-source.yaml） */
  input: string
  /** 单位（xlsx 占位符 "—" 归一为 null） */
  unit: string | null
  /** 原始可选项字符串（未拆结构化词表，P3 才做） */
  options: string | null
  /** 字段校验约束（原样透传自 field-source.yaml；无约束为 null） */
  validation: FieldValidation | null
  requirement: FieldRequirement
  /** 是否属 R0 最小可复现集 */
  r0: boolean
  /** §5 过程步字段的参数组（stageGroups 的键）；其余字段为 null */
  group: string | null
  /** 表单占位符中文/英文展示；不作为提交值 */
  placeholderZh: string
  placeholderEn: string
  /** 可选的字段级帮助文本，两种语言须成对 */
  helpZh: string | null
  helpEn: string | null
  /** 条件不成立时隐藏，而非仅切换必填状态 */
  visibilityGated?: true
}

export interface StageType {
  name: string
  /** 中文显示名；name 是稳定机器码。 */
  labelZh: string
  /** 英文显示名；提交值使用 name 的稳定机器码。 */
  labelEn: string
  /** 该阶段显示哪些参数组（stageGroups 的键；common 恒显） */
  shows: string[]
  /** 该阶段额外强制必填的字段键 */
  requiredExtra?: string[]
}

export interface CharacterizationConditionField {
  key: string
  label_zh: string
  label_en: string
  value_type:
    | 'text'
    | 'number'
    | 'integer'
    | 'range'
    | 'size'
    | 'resolution'
  unit?: string
  components?: Array<{ key: string; label_zh: string; label_en: string }>
}

export interface CharacterizationProfile {
  label_zh: string
  label_en: string
  instrument_required: boolean
  raw_files_required: boolean
  show_growth_presence: boolean
  raw_file_guidance_zh: string
  allowed_region_types: string[]
  required_condition_keys: string[]
  optional_condition_keys: string[]
  condition_fields: CharacterizationConditionField[]
  allowed_property_codes: string[]
  default_property_codes: string[]
  allowed_assertion_types: string[]
}

export interface CharacterizationProperty {
  label_zh: string
  label_en: string
  unit: string
}

export interface GasSpecies {
  label_zh: string
  label_en: string
  aliases: string[]
}
`

const BANNER = `// AUTO-GENERATED — 请勿手改。
// 生成器: frontend-next/scripts/generate-field-metadata.ts
// 数据权威源: docs/standard/field-source.yaml（改字段改 YAML，勿手改本文件）
// 重新生成: bun run gen:fields（CI 有 drift 门禁）
`

const content =
  [
    BANNER,
    TYPES,
    `export const fieldMetadataMeta: FieldMetadataMeta = ${JSON.stringify(meta, null, 2)}`,
    `/** 已发布实验记录字段，按模块键分组。 */\nexport const experimentModules: Record<string, FieldMetadata[]> = ${JSON.stringify(experimentModules, null, 2)}`,
    `/** 三个一等实体的登记字段（material_lot / setup / instrument） */\nexport const entities: Record<string, FieldMetadata[]> = ${JSON.stringify(entities, null, 2)}`,
    `/** 稳定机器码 → 首选中文显示名（兼容别名不覆盖）。 */\nexport const optionLabelsZh: Record<string, string> = ${JSON.stringify(preferredOptionLabels('zh'), null, 2)}`,
    `/** 稳定机器码 → 首选英文显示名（兼容别名不覆盖）。 */\nexport const optionLabelsEn: Record<string, string> = ${JSON.stringify(preferredOptionLabels('en'), null, 2)}`,
    `/** 旧中文规范值 → 稳定字符串机器码；布尔复选映射不进入此表。 */\nexport const optionCodes: Record<string, string> = ${JSON.stringify(Object.fromEntries(Object.entries(doc.option_codes).filter((entry): entry is [string, string] => typeof entry[1] === 'string')), null, 2)}`,
    `/** 字段专用兼容标签 → 机器码；优先于全局别名。 */\nexport const fieldOptionCodes: Record<string, Record<string, string>> = ${JSON.stringify(doc.field_option_codes ?? {}, null, 2)}`,
    `/** 规范单位 → 英文显示名 */\nexport const unitLabelsEn: Record<string, string> = ${JSON.stringify(doc.unit_labels_en, null, 2)}`,
    `/** §5 参数组：组名 → 说明（common 恒显） */\nexport const stageGroups: Record<string, string> = ${JSON.stringify(stageGroups, null, 2)}`,
    `/** §5 阶段类型 → 参数组显隐映射（驱动动态表单，D11） */\nexport const stageTypes: StageType[] = ${JSON.stringify(stageTypes, null, 2)}`,
    `/** 表征属性代码、显示名与规范单位。 */\nexport const characterizationProperties: Record<string, CharacterizationProperty> = ${JSON.stringify(Object.fromEntries(Object.entries(doc.characterization_properties).map(([code, property]) => [code, { ...property, unit: doc.scientific_contract.property_units[code] }])), null, 2)}`,
    `/** 表征方法、条件、区域、属性与材料结论的单一合同。 */\nexport const characterizationProfiles: Record<string, CharacterizationProfile> = ${JSON.stringify(doc.characterization_profiles, null, 2)}`,
    `/** 过程气体稳定机器码与显示/兼容别名。 */\nexport const gasSpecies: Record<string, GasSpecies> = ${JSON.stringify(doc.gas_species, null, 2)}`,
  ].join('\n\n') + '\n'

await Bun.write(OUT, content)

const fieldCount = Object.values(experimentModules).reduce(
  (n, list) => n + list.length,
  0,
)
const entityCount = Object.values(entities).reduce(
  (n, list) => n + list.length,
  0,
)
// eslint-disable-next-line no-console
console.log(
  `generated ${OUT}\n  实验字段 ${fieldCount} / ${Object.keys(experimentModules).length} 模块 · ` +
    `实体字段 ${entityCount} / ${Object.keys(entities).length} 实体 · 阶段类型 ${stageTypes.length}`,
)
