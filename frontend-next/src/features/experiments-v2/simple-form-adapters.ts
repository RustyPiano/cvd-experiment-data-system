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

export function compositionValueForDisplay(
  value: number | undefined,
  basis: string,
) {
  return value === undefined
    ? ''
    : basis === 'mol_fraction'
      ? String(value * 100)
      : String(value)
}

export function compositionValueForPayload(value: string, basis: string) {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return basis === 'mol_fraction' ? parsed / 100 : parsed
}

const ACTION_MARKER = '\n\n采取的处理：'

export function splitEventDescription(value: string | undefined) {
  const [description = '', action = ''] = (value ?? '').split(ACTION_MARKER, 2)
  return { description, action }
}

export function buildEventDescription(description: string, action: string) {
  const trimmedDescription = description.trim()
  const trimmedAction = action.trim()
  return trimmedAction
    ? `${trimmedDescription}${ACTION_MARKER}${trimmedAction}`
    : trimmedDescription
}

export function simpleGrowthIssue(
  segments: Array<{ segment_type: string; start_s: number; end_s: number }>,
  channels: Array<{
    channel_type: string
    source_type: string
    zone_index?: number
    series?: Array<{ start_s: number; end_s?: number; value: number | string }>
    scalar_value?: number
  }>,
  settings: {
    pressure_regime?: string
    cooling_method?: string
    cooling_other?: string
  },
  zoneCount: number | null,
): string | null {
  const growth = segments.find((item) => item.segment_type === 'growth')
  if (
    !growth ||
    !Number.isFinite(growth.start_s) ||
    !Number.isFinite(growth.end_s) ||
    growth.start_s < 0 ||
    growth.end_s <= growth.start_s
  ) {
    return '请填写有效的生长开始和结束时间。'
  }
  for (let zone = 1; zone <= (zoneCount ?? 0); zone += 1) {
    const points = channels.find(
      (item) =>
        item.channel_type === 'temperature' &&
        item.source_type === 'setpoint' &&
        item.zone_index === zone,
    )?.series
    const times = points?.map((point) => point.start_s) ?? []
    if (
      !points?.length ||
      times[0] !== 0 ||
      times.some((time, index) => index > 0 && time <= times[index - 1])
    ) {
      return `温区 ${zone} 的温度程序必须从 0 分钟开始，并按时间递增。`
    }
  }
  for (const channel of channels.filter(
    (item) => item.channel_type === 'flow',
  )) {
    if (
      !channel.series?.length ||
      channel.series.some(
        (item) =>
          item.end_s === undefined ||
          item.end_s <= item.start_s ||
          !Number.isFinite(Number(item.value)),
      )
    ) {
      return '请补齐气体的供气时间和流量。'
    }
  }
  if (!settings.pressure_regime) return '请选择压力制度。'
  const pressure = channels.find((item) => item.channel_type === 'pressure')
  if (
    settings.pressure_regime !== 'atmospheric' &&
    !Number.isFinite(pressure?.scalar_value)
  ) {
    return '请填写工作压力。'
  }
  if (!settings.cooling_method) return '请选择降温方式。'
  if (settings.cooling_method === 'other' && !settings.cooling_other?.trim()) {
    return '请说明降温方式。'
  }
  return null
}
