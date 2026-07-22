// 表单初始状态构造：空表（新建）与从后端 run + 模块 payload 还原（编辑）。
import type { V2ExperimentRead, V2ModulePayloadRead } from './api'
import { isoToDateTimeLocal } from './datetime'
import {
  componentsFromPayload,
  emptyModuleValues,
  itemsFromPayload,
  moduleValueAsString,
  moduleValuesFromPayload,
} from './field-logic'
import type { ExperimentV2FormState } from './form-types'

export function buildEmptyState(operator = ''): ExperimentV2FormState {
  const basicInfo = emptyModuleValues('basic_info')
  basicInfo['operator'] = operator
  return {
    basic_info: basicInfo,
    target_product: emptyModuleValues('target_product'),
    components: [],
    equipment: { setupId: '', version: null, snapshot: null },
    precursors: [],
    substrates: [],
    process_steps: [],
    process_events: [],
  }
}

/** 把 run 的引用快照（*_snapshot + attrs_snapshot）归一为「直取键」，与选中实体版本 data 同形。 */
function snapshotFromRun(
  snap: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!snap) return null
  const attrs = (snap['attrs_snapshot'] ?? {}) as Record<string, unknown>
  return {
    setup_code: snap['setup_code_snapshot'],
    setup_name: snap['setup_name_snapshot'],
    zone_count: snap['zone_count_snapshot'],
    orientation: snap['orientation_snapshot'],
    coordinate_system: snap['coordinate_system_snapshot'],
    ...attrs,
  }
}

export function buildStateFromLoaded(
  run: V2ExperimentRead,
  modules: Record<string, V2ModulePayloadRead | null>,
): ExperimentV2FormState {
  const basicPayload = modules['basic_info']?.payload_json ?? null
  const tpPayload = modules['target_product']?.payload_json ?? null
  const precPayload = modules['precursors']?.payload_json ?? null
  const subPayload = modules['substrates']?.payload_json ?? null
  const stepsPayload = modules['process_steps']?.payload_json ?? null
  const eventsPayload = modules['process_events']?.payload_json ?? null

  const basicInfo = moduleValuesFromPayload('basic_info', basicPayload)
  basicInfo['started_at'] = isoToDateTimeLocal(
    moduleValueAsString(basicInfo['started_at']),
  )

  return {
    basic_info: basicInfo,
    target_product: moduleValuesFromPayload('target_product', tpPayload),
    components: componentsFromPayload(tpPayload),
    equipment: {
      setupId: run.setup_ref ?? '',
      version: run.setup_ref_version ?? null,
      snapshot: snapshotFromRun(run.setup_ref_snapshot_json),
    },
    precursors: itemsFromPayload('precursors', precPayload),
    substrates: itemsFromPayload('substrates', subPayload),
    process_steps: itemsFromPayload('process_steps', stepsPayload),
    process_events: itemsFromPayload('process_events', eventsPayload),
  }
}
