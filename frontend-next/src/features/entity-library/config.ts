// 一等实体库配置（MaterialLot / Setup / Instrument）。
// 元数据权威源：src/shared/generated/field-metadata.ts 的 `entities`（由 field-source.yaml 生成）。
// 本文件只做「实体种类 → 路由段 / API 复数名 / i18n 键 / 列表展示字段」的静态映射。
import { Boxes, FlaskConical, Microscope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** field-metadata `entities` 的键（也是 create/append 端点的实体类别标识）。 */
export const ENTITY_KINDS = ['material_lot', 'setup', 'instrument'] as const
export type EntityKind = (typeof ENTITY_KINDS)[number]

export interface EntityKindConfig {
  kind: EntityKind
  /** REST 复数路径段：/api/v1/v2/{apiPath} 与前端路由 /{apiPath} 共用 */
  apiPath: 'material-lots' | 'setups' | 'instruments'
  /** locales common.entityLibrary 下的键，用于 t(`entityLibrary.${i18nKey}.…`) */
  i18nKey: 'materialLot' | 'setup' | 'instrument'
  /** 列表页展示：主名称字段键 + 编号字段键（取自 latest_version.data） */
  primaryKey: string
  codeKey: string
  icon: LucideIcon
}

export const entityConfigs: Record<EntityKind, EntityKindConfig> = {
  material_lot: {
    kind: 'material_lot',
    apiPath: 'material-lots',
    i18nKey: 'materialLot',
    primaryKey: 'substance_name',
    codeKey: 'batch_number',
    icon: Boxes,
  },
  setup: {
    kind: 'setup',
    apiPath: 'setups',
    i18nKey: 'setup',
    primaryKey: 'setup_name',
    codeKey: 'setup_code',
    icon: FlaskConical,
  },
  instrument: {
    kind: 'instrument',
    apiPath: 'instruments',
    i18nKey: 'instrument',
    primaryKey: 'name_type',
    codeKey: 'instrument_code',
    icon: Microscope,
  },
}

/**
 * TanStack 类型化路由 id（生成于 routeTree.gen.ts）。集中在此，供列表↔详情跳转与导航复用。
 */
export const entityRoutes = {
  material_lot: {
    list: '/material-lots',
    detail: '/material-lots/$entityId',
  },
  setup: {
    list: '/setups',
    detail: '/setups/$entityId',
  },
  instrument: {
    list: '/instruments',
    detail: '/instruments/$entityId',
  },
} as const
