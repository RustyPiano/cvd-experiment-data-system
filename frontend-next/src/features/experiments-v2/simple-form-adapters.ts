import type { V2ExperimentCreate } from './api'
import { toIsoDateTime } from './datetime'

export type SimpleExperimentCreateValues = {
  startedAt: string
  performerIds: string[]
  ambientTemperature: string
  ambientHumidity: string
}

function requiredNumber(value: string): number | null {
  if (value.trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function simpleCreateIssue(
  values: SimpleExperimentCreateValues,
): 'startedAt' | 'performers' | 'temperature' | 'humidity' | null {
  if (Number.isNaN(new Date(values.startedAt).getTime())) return 'startedAt'
  if (values.performerIds.length === 0) return 'performers'
  if (requiredNumber(values.ambientTemperature) === null) return 'temperature'
  const humidity = requiredNumber(values.ambientHumidity)
  if (humidity === null || humidity < 0 || humidity > 100) return 'humidity'
  return null
}

export function buildSimpleCreatePayload(
  values: SimpleExperimentCreateValues,
): V2ExperimentCreate {
  const measuredAt = toIsoDateTime(values.startedAt)
  return {
    started_at: measuredAt,
    synthesis_method: 'CVD',
    performed_by_user_ids: values.performerIds,
    ambient_temperature: {
      value: Number(values.ambientTemperature),
      measured_at: measuredAt,
      source_type: 'manual_entry',
    },
    ambient_humidity: {
      value: Number(values.ambientHumidity),
      measured_at: measuredAt,
      source_type: 'manual_entry',
    },
    precheck_confirmed: false,
  }
}
