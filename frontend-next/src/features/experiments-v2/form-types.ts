import type { ModuleValues } from './field-logic'

export interface EquipmentRef {
  setupId: string
  version: number | null
  snapshot: Record<string, unknown> | null
  tubeUsageHistory: string
}

export interface ExperimentV2FormState {
  equipment: EquipmentRef
  substrates: ModuleValues[]
}
