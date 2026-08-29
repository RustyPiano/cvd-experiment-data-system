import type { V2ExperimentCreate } from './api'
import { gasCylinderMatchesSpecies } from './components/reference-snapshot'
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
  if (
    values.ambientTemperature.trim() &&
    requiredNumber(values.ambientTemperature) === null
  ) {
    return 'temperature'
  }
  const humidity = requiredNumber(values.ambientHumidity)
  if (
    values.ambientHumidity.trim() &&
    (humidity === null || humidity < 0 || humidity > 100)
  ) {
    return 'humidity'
  }
  return null
}

export function buildSimpleCreatePayload(
  values: SimpleExperimentCreateValues,
): V2ExperimentCreate {
  const measuredAt = toIsoDateTime(values.startedAt)
  const ambient = (value: string) =>
    value.trim()
      ? {
          value: Number(value),
          measured_at: measuredAt,
          source_type: 'manual_entry' as const,
        }
      : { source_type: 'not_measured' as const }
  return {
    started_at: measuredAt,
    synthesis_method: 'CVD',
    performed_by_user_ids: values.performerIds,
    ambient_temperature: ambient(values.ambientTemperature),
    ambient_humidity: ambient(values.ambientHumidity),
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

const processDeviationCodes = new Set([
  'line_blockage',
  'pressure_excursion',
  'signal_anomaly',
  'manual_intervention',
  'equipment_alarm',
  'manual_stop',
  'power_interruption',
  'water_interruption',
  'gas_interruption',
  'plan_changed',
  'other',
])

export function simpleProcessEventsIssue(
  events: Array<{
    start_s: number
    observed_deviations: string[]
    description?: string
  }>,
): string | null {
  for (const event of events) {
    if (
      event.observed_deviations.length === 0 ||
      event.observed_deviations.some((code) => !processDeviationCodes.has(code))
    ) {
      return '请选择异常类型。'
    }
    if (!Number.isFinite(event.start_s) || event.start_s < 0) {
      return '请填写异常发生时间。'
    }
    if (
      event.observed_deviations.includes('other') &&
      !splitEventDescription(event.description).description.trim()
    ) {
      return '请说明其他异常的具体情况。'
    }
  }
  return null
}

type TimelineSegment = {
  segment_key: string
  segment_type: string
  sequence: number
  start_s: number
  end_s: number
  label?: string
  note?: string
}

type TimelineChannel = {
  channel_type?: string
  series?: Array<{
    start_s: number
    end_s?: number
    timing_preset?: GasTimingPreset
  }>
}

export type GasTimingPreset = 'whole_process' | 'custom'

export function wholeProcessInterval(
  processEnd: number,
): { start_s: number; end_s: number } | null {
  return processEnd > 0 ? { start_s: 0, end_s: processEnd } : null
}

export function updateTemperatureStepDuration<T extends { start_s: number }>(
  points: T[],
  index: number,
  durationMin: number,
): T[] {
  if (index === 0) {
    return points.map((point, current) =>
      current === 0 ? { ...point, start_s: 0 } : point,
    )
  }
  const previous = points[index - 1]
  const current = points[index]
  if (!previous || !current) return points
  const nextStart = previous.start_s + durationMin * 60
  const delta = Number.isFinite(current.start_s)
    ? nextStart - current.start_s
    : 0
  return points.map((point, currentIndex) =>
    currentIndex === index
      ? { ...point, start_s: nextStart }
      : currentIndex > index && Number.isFinite(point.start_s)
        ? { ...point, start_s: point.start_s + delta }
        : point,
  )
}

export function temperatureStepOperation(
  previousValue: number | string,
  currentValue: number | string,
): '升温' | '降温' | '保温' | null {
  const previous = Number(previousValue)
  const current = Number(currentValue)
  if (
    previousValue === '' ||
    currentValue === '' ||
    !Number.isFinite(previous) ||
    !Number.isFinite(current)
  ) {
    return null
  }
  return current > previous ? '升温' : current < previous ? '降温' : '保温'
}

export function simpleProcessEndSeconds(
  segments: TimelineSegment[],
  channels: TimelineChannel[],
  fieldParams: Array<{ end_min: number | null }> = [],
  events: Array<{ start_s: number; end_s?: number }> = [],
): number {
  return Math.max(
    0,
    ...segments
      .filter(
        (item) =>
          !item.segment_key.endsWith('_post_growth') &&
          !item.segment_key.endsWith('_cooling'),
      )
      .map((item) => item.end_s),
    ...channels.flatMap((channel) =>
      (channel.series ?? [])
        .filter(
          (point) =>
            channel.channel_type !== 'flow' ||
            !point.timing_preset ||
            point.timing_preset === 'custom',
        )
        .map((point) => point.end_s ?? point.start_s),
    ),
    ...fieldParams.map((field) => (field.end_min ?? 0) * 60),
    ...events.map((event) => event.end_s ?? event.start_s),
  )
}

export function buildSimpleSourceLoadsPayload<
  T extends {
    preparation_steps?: Array<{
      step_type: string
      parameters: Record<string, unknown>
    }>
    ingredients: Array<{
      snapshot?: unknown
      function_role?: unknown
      process_roles?: string[]
    }>
  },
>(loads: T[]) {
  return {
    items: loads.map((load) => {
      const preparationSteps = load.preparation_steps?.map((step) =>
        step.step_type === 'spin_coat' && !Array.isArray(step.parameters.stages)
          ? {
              ...step,
              parameters: {
                stages: [
                  {
                    speed_rpm: step.parameters.speed_rpm,
                    duration_s: step.parameters.duration_s,
                  },
                ],
              },
            }
          : step,
      )
      return {
        ...load,
        ...(preparationSteps ? { preparation_steps: preparationSteps } : {}),
        ingredients: load.ingredients.map((ingredient) => {
          const payload = { ...ingredient }
          delete payload.snapshot
          delete payload.function_role
          payload.process_roles ??= []
          return payload
        }),
      }
    }),
  }
}

export function simpleGrowthIssue(
  _segments: Array<{ segment_type: string; start_s: number; end_s: number }>,
  channels: Array<{
    channel_type: string
    source_type: string
    gas_species_code?: string
    gas_lot_id?: string
    gas_lot_version?: number
    subject_snapshot?: Record<string, unknown>
    measurement_source?: string
    measurement_source_other?: string
    zone_index?: number
    pressure_type?: string
    unit?: string
    series?: Array<{ start_s: number; end_s?: number; value: number | string }>
    scalar_value?: number
  }>,
  settings: {
    pressure_regime?: string
    cooling_method?: string
    cooling_other?: string
    cooling_rate_C_per_min?: number
    lid_open_temperature_C?: number
    preparation_operations?: Array<{
      operation_type: string
      duration_min: number
      cycle_count?: number
      gas_sources?: Array<{
        material_lot_id: string
        material_lot_version?: number
      }>
      gases?: string[]
      other_name?: string
    }>
  },
  zoneCount: number | null,
  fieldParamsValid = true,
): string | null {
  const preparationOperations = settings.preparation_operations ?? []
  for (const operation of preparationOperations) {
    if (
      !Number.isFinite(operation.duration_min) ||
      operation.duration_min <= 0
    ) {
      return '请填写大于 0 的系统准备持续时间。'
    }
    if (
      operation.operation_type === 'gas_exchange' &&
      (!operation.cycle_count ||
        operation.cycle_count < 1 ||
        !Number.isInteger(operation.cycle_count) ||
        !operation.gas_sources?.length ||
        operation.gas_sources.some(
          (source) => !source.material_lot_id || !source.material_lot_version,
        ) ||
        new Set(operation.gas_sources.map((source) => source.material_lot_id))
          .size !== operation.gas_sources.length)
    ) {
      return '请选择实际使用且不重复的气瓶批次，并填写置换次数。'
    }
    if (operation.operation_type === 'other' && !operation.other_name?.trim()) {
      return '请说明其他系统准备操作。'
    }
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
      times.some((time, index) => index > 0 && time <= times[index - 1]) ||
      points.some(
        (point) => point.value === '' || !Number.isFinite(Number(point.value)),
      )
    ) {
      return `温区 ${zone} 的温度程序必须从 0 分钟开始，并按时间递增。`
    }
  }
  const gasChannels = channels.filter((item) => item.channel_type === 'flow')
  if (gasChannels.length === 0) return '请至少添加一种实际使用的气体。'
  for (const channel of gasChannels) {
    if (!channel.gas_species_code?.trim()) return '请选择气体种类。'
    if (!channel.gas_lot_id || !channel.gas_lot_version) {
      return '请选择实际使用的气瓶批次。'
    }
    if (
      channel.subject_snapshot &&
      !gasCylinderMatchesSpecies(
        channel.subject_snapshot,
        channel.gas_species_code,
      )
    ) {
      return '所选气瓶批次与气体种类不匹配。'
    }
    if (
      !['mfc', 'rotameter', 'other'].includes(channel.measurement_source ?? '')
    ) {
      return '请选择气体流量的测量来源。'
    }
    if (
      channel.measurement_source === 'other' &&
      !channel.measurement_source_other?.trim()
    ) {
      return '请说明其他流量测量来源。'
    }
    if (
      !channel.series?.length ||
      channel.series.some(
        (item) =>
          !Number.isFinite(item.start_s) ||
          item.start_s < 0 ||
          item.end_s === undefined ||
          !Number.isFinite(item.end_s) ||
          item.end_s <= item.start_s ||
          item.value === '' ||
          !Number.isFinite(Number(item.value)) ||
          Number(item.value) <= 0,
      )
    ) {
      return '请填写有效的供气时间和大于 0 的流量。'
    }
    if (
      channel.series.some(
        (item, index) =>
          index > 0 && item.start_s < channel.series![index - 1].start_s,
      )
    ) {
      return '请按开始时间顺序填写供气区间。'
    }
    const ordered = [...channel.series].sort(
      (left, right) => left.start_s - right.start_s,
    )
    if (
      ordered.some(
        (item, index) =>
          index > 0 && item.start_s < (ordered[index - 1].end_s ?? 0),
      )
    ) {
      return '同一种气体的供气区间不能重叠。'
    }
  }
  if (!settings.pressure_regime) return '请选择反应压力条件。'
  const pressure = channels.find(
    (item) =>
      item.channel_type === 'pressure' && item.source_type === 'setpoint',
  )
  if (
    settings.pressure_regime !== 'atmospheric' &&
    (!Number.isFinite(pressure?.scalar_value) ||
      (pressure?.scalar_value ?? 0) <= 0)
  ) {
    return '请填写大于 0 的工作压力。'
  }
  if (
    settings.pressure_regime !== 'atmospheric' &&
    pressure?.pressure_type !== 'absolute'
  ) {
    return '工作压力必须使用绝对压力。'
  }
  if (settings.pressure_regime !== 'atmospheric' && pressure) {
    const scale = { Pa: 1, kPa: 1000, mbar: 100, Torr: 133.32236842105263 }[
      pressure.unit ?? ''
    ]
    if (!scale) return '请选择工作压力单位。'
    const pressurePa = (pressure.scalar_value ?? 0) * scale
    if (
      settings.pressure_regime === 'low_pressure' &&
      !(pressurePa > 1e-6 && pressurePa < 80000)
    ) {
      return '低压条件的绝对压力应大于 10⁻⁶ Pa 且低于 80,000 Pa。'
    }
    if (
      settings.pressure_regime === 'ultra_high_vacuum' &&
      !(pressurePa > 0 && pressurePa <= 1e-6)
    ) {
      return '超高真空的绝对压力应不高于 10⁻⁶ Pa。'
    }
  }
  if (!settings.cooling_method) return '请选择降温方式。'
  if (settings.cooling_method === 'other' && !settings.cooling_other?.trim()) {
    return '请说明降温方式。'
  }
  if (
    settings.cooling_method === 'controlled_cooling' &&
    (!Number.isFinite(settings.cooling_rate_C_per_min) ||
      (settings.cooling_rate_C_per_min ?? 0) <= 0)
  ) {
    return '请填写大于 0 的受控降温速率。'
  }
  if (
    settings.cooling_method === 'open_lid_cooling' &&
    !Number.isFinite(settings.lid_open_temperature_C)
  ) {
    return '请填写开盖温度。'
  }
  if (!fieldParamsValid) return '请补齐实际使用的外场参数。'
  return null
}
