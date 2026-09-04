import { structuredValueFromRaw } from '@/shared/structured-field'

import type { V2ExperimentRead, V2ModulePayloadRead } from './api'
import {
  substratePlacementRelationsFromPayload,
  substratesFromPayload,
} from './field-logic'
import type { ExperimentV2FormState } from './form-types'

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
  const equipment = modules['equipment']?.payload_json
  return {
    equipment: {
      setupId: run.setup_ref ?? '',
      version: run.setup_ref_version ?? null,
      snapshot: snapshotFromRun(run.setup_ref_snapshot_json),
      tubeUsageHistory: structuredValueFromRaw(
        'tube_usage_history',
        equipment?.['tube_usage_history'],
      ),
    },
    substrates: substratesFromPayload(modules['substrates']?.payload_json),
    substratePlacementRelations: substratePlacementRelationsFromPayload(
      modules['substrates']?.payload_json,
    ),
  }
}
