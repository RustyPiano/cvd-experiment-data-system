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
  value: string | string[]
}
interface RawRequirement {
  raw: string
  level: string
  condition?: RawCondition
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
  modules: Record<string, string>
  entity_keys: Record<string, string>
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
  requirement: {
    raw: string
    level: string
    condition: RawCondition | null
  }
  r0: boolean
  group: string | null
}

function toFieldMetadata(field: RawField): FieldMetadata {
  const req = field.requirement
  const condition = req.condition
    ? {
        field: req.condition.field,
        op: req.condition.op,
        value: req.condition.value,
      }
    : null
  return {
    key: field.key,
    labelZh: field.label,
    labelEn: field.label_en,
    input: field.input,
    unit: dashToNull(field.unit),
    options: dashToNull(field.options),
    requirement: { raw: req.raw, level: req.level, condition },
    r0: Boolean(field.r0),
    group: field.group ?? null,
  }
}

function groupByModule(
  sections: RawSection[],
  moduleMap: Record<string, string>,
): Record<string, FieldMetadata[]> {
  const out: Record<string, FieldMetadata[]> = {}
  for (const section of sections) {
    for (const field of section.fields) {
      const key = moduleMap[field.module]
      if (!key) {
        throw new Error(
          `模块 ${field.module} 未在 modules/entity_keys 映射中登记（字段 ${field.key}）`,
        )
      }
      ;(out[key] ??= []).push(toFieldMetadata(field))
    }
  }
  return out
}

interface StageType {
  name: string
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
)
const entities = groupByModule(doc.entities.sections, doc.entity_keys)
const stageGroups = doc.stage_types.groups
const stageTypes: StageType[] = doc.stage_types.types.map((type) => {
  const out: StageType = { name: type.name, shows: type.shows ?? [] }
  if (type.required_extra && type.required_extra.length > 0) {
    out.requiredExtra = type.required_extra
  }
  return out
})

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
  value: string | string[]
}

export interface FieldRequirement {
  raw: string
  level: RequirementLevel
  condition: FieldCondition | null
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
  requirement: FieldRequirement
  /** 是否属 R0 最小可复现集 */
  r0: boolean
  /** §5 过程步字段的参数组（stageGroups 的键）；其余字段为 null */
  group: string | null
}

export interface StageType {
  name: string
  /** 该阶段显示哪些参数组（stageGroups 的键；common 恒显） */
  shows: string[]
  /** 该阶段额外强制必填的字段键 */
  requiredExtra?: string[]
}
`

const BANNER = `// AUTO-GENERATED — 请勿手改。
// 生成器: frontend-next/scripts/generate-field-metadata.ts
// 数据权威源: docs/standard/field-source.yaml（改字段改 YAML，勿手改本文件）
// 重新生成: bun run gen:fields（CI 有 drift 门禁）
`

const content = [
  BANNER,
  TYPES,
  `export const fieldMetadataMeta: FieldMetadataMeta = ${JSON.stringify(meta, null, 2)}`,
  `/** §1–§8 实验记录字段，按模块键分组（basic_info / target_product / … / pvd） */\nexport const experimentModules: Record<string, FieldMetadata[]> = ${JSON.stringify(experimentModules, null, 2)}`,
  `/** 三个一等实体的登记字段（material_lot / setup / instrument） */\nexport const entities: Record<string, FieldMetadata[]> = ${JSON.stringify(entities, null, 2)}`,
  `/** §5 参数组：组名 → 说明（common 恒显） */\nexport const stageGroups: Record<string, string> = ${JSON.stringify(stageGroups, null, 2)}`,
  `/** §5 阶段类型 → 参数组显隐映射（驱动动态表单，D11） */\nexport const stageTypes: StageType[] = ${JSON.stringify(stageTypes, null, 2)}`,
  '',
].join('\n\n')

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
