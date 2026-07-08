// 一等实体表单的「元数据驱动」纯逻辑：可选项解析、条件显隐、有效必填、默认值。
// 全部只读消费 field-metadata（生成物），不含 React/网络，便于 vitest 单测。
import { entities } from '@/shared/generated/field-metadata'
import type {
  FieldCondition,
  FieldMetadata,
} from '@/shared/generated/field-metadata'
import type { EntityKind } from './config'

/** 表单值统一以字符串承载（后端 V2EntityVersionPayload 为 freeform，接受任意值）。 */
export type EntityFormValues = Record<string, string>

/**
 * 版本号由后端版本表自增分配（V2EntityVersionRead.version），不是用户录入项，
 * 故从可编辑表单字段中剔除；列表/详情改用后端返回的 version 展示。
 */
export const SYSTEM_FIELD_KEYS = new Set(['version'])

/** 该实体的「可编辑」注册字段（剔除系统托管字段）。 */
export function getEntityFields(kind: EntityKind): FieldMetadata[] {
  return entities[kind].filter((field) => !SYSTEM_FIELD_KEYS.has(field.key))
}

/**
 * 把 options 字符串解析为「干净枚举」token 列表；否则返回 null（当作占位提示，走文本框）。
 * 分隔符优先 '·'（形如 'SiO₂/Si·蓝宝石·…'，避免误切 'SiO₂/Si' 里的 '/'），否则 '/'。
 * 含描述性标点的一律判为非枚举（如 '受控+其他'、'x50严谨；目数可接受'、'如激光波长/…'）。
 */
const DESCRIPTIVE_MARKERS = [
  '；',
  ';',
  '或',
  '+',
  '（',
  '(',
  '，',
  '如',
  '视',
  '见',
  '建议',
  '标准',
  '每条',
  '≥',
]

export function parseEnumOptions(options: string | null): string[] | null {
  if (!options) return null
  if (DESCRIPTIVE_MARKERS.some((marker) => options.includes(marker)))
    return null
  const separator = options.includes('·') ? '·' : '/'
  const tokens = options
    .split(separator)
    .map((token) => token.trim())
    .filter(Boolean)
  return tokens.length >= 2 ? tokens : null
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
 * 找到「类别驱动字段」的键：其枚举选项包含该子类名的字段（如 批次类别 的选项含 衬底/气瓶）。
 * 完全由元数据推导，不硬编码 material_lot 语义。
 */
function findCategoryDriverKey(
  kind: EntityKind,
  subcategory: string,
): string | null {
  for (const field of entities[kind]) {
    const options = parseEnumOptions(field.options)
    if (options?.includes(subcategory)) return field.key
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
  value: string | undefined,
): boolean {
  const current = value == null ? '' : String(value)
  switch (condition.op) {
    case 'eq':
      return current === condition.value
    case 'ne':
      return current !== condition.value
    case 'in':
      return Array.isArray(condition.value)
        ? condition.value.includes(current)
        : current === condition.value
    default:
      return true
  }
}

/**
 * 字段是否应显示：
 *  1) 子类前缀（▸衬底·/▸气瓶·）→ 需驱动字段（批次类别）取值等于该子类；
 *  2) 元数据显式条件（requirement.condition）→ 需条件成立。
 * 二者皆满足（或不适用）才显示。跨实体无法解析的引用按「显示」兜底。
 */
export function isFieldVisible(
  kind: EntityKind,
  field: FieldMetadata,
  values: EntityFormValues,
): boolean {
  const subcategory = parseSubcategory(field.labelZh)
  if (subcategory) {
    const driverKey = findCategoryDriverKey(kind, subcategory)
    if (driverKey && (values[driverKey] ?? '') !== subcategory) return false
  }

  const condition = field.requirement.condition
  if (condition) {
    const refKey = resolveConditionKey(kind, condition.field)
    if (refKey && !matchesCondition(condition, values[refKey])) return false
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

/** 建立表单默认值：所有可编辑字段键均置为字符串（create 空串；newVersion 取旧版本快照）。 */
export function buildDefaultValues(
  kind: EntityKind,
  source?: Record<string, unknown> | null,
): EntityFormValues {
  const values: EntityFormValues = {}
  for (const field of getEntityFields(kind)) {
    const raw = source?.[field.key]
    values[field.key] = raw == null ? '' : String(raw)
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
): Record<string, string> {
  const payload: Record<string, string> = {}
  for (const field of getEntityFields(kind)) {
    if (!isFieldVisible(kind, field, values)) continue
    const value = (values[field.key] ?? '').trim()
    if (value) payload[field.key] = value
  }
  return payload
}
