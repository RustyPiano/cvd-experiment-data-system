// v2 实验录入表单的共享状态类型与分模块保存接口。
import type { ComponentRow, ModuleValues } from './field-logic'

/** 装置引用（§2）：引用的装置实体 id + 版本；投影字段由被引用 Setup 版本冻结（只读）。 */
export interface EquipmentRef {
  setupId: string
  version: number | null
  /** 选中装置版本的注册数据（用于只读投影展示；随引用冻结）。 */
  snapshot: Record<string, unknown> | null
  /** 本炉次对应的炉管清零次数与清零后使用序号（非 Setup 固定属性）。 */
  tubeUsageHistory: string
}

/** 整表状态。 */
export interface ExperimentV2FormState {
  basic_info: ModuleValues
  target_product: ModuleValues
  components: ComponentRow[]
  equipment: EquipmentRef
  precursors: ModuleValues[]
  substrates: ModuleValues[]
  /** §5 过程步（每条含 stage_type + 该阶段字段键）。 */
  process_steps: ModuleValues[]
  /** §6 过程事件（可重复轻量条目）。 */
  process_events: ModuleValues[]
}

/** 分模块草稿保存的注入接口（编辑态提供；新建态为 undefined）。 */
export interface ModuleSaveProps {
  onSave: () => void
  saving: boolean
  saved: boolean
  error: string | null
}
