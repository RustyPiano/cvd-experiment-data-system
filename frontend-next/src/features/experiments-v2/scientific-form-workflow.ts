export function tubeUsageParts(value: string): [string, string] {
  const [resetCount = '', useNumber = ''] = value.split(',', 2)
  return [resetCount.trim(), useNumber.trim()]
}

type WorkflowSegment = {
  segment_type: string
  start_s: number
  end_s: number
}

type WorkflowChannel = {
  channel_key: string
  channel_type: string
  source_type: string
  subject_type?: string
  subject_ref?: string
  gas_species?: string
  zone_index?: number
  pressure_location?: string
  pressure_type?: string
  unit?: string
  data_kind: 'scalar' | 'interval_series' | 'timeseries_file'
  scalar_value?: number
  series?: Array<{ start_s: number; end_s?: number; value: number | string }>
  file_asset_id?: string
  sensor_or_controller_snapshot?: Record<string, unknown>
}

const SOURCE_LABELS: Record<string, string> = {
  setpoint: '设定',
  measured: '实测',
  inferred: '推断',
}

const CHANNEL_LABELS: Record<string, string> = {
  valve_state: '阀门状态',
  source_position: '前驱体源位置',
  furnace_position: '炉体位置',
  plasma_power: '等离子体功率',
  shutter_state: '挡板状态',
}

function snapshotText(channel: WorkflowChannel, key: string): string {
  const value = channel.sensor_or_controller_snapshot?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function zoneLabel(value: string): string {
  const match = /^zone_(\d+)$/.exec(value)
  return match ? `温区 ${match[1]}` : value
}

export function processChannelTitle(channel: WorkflowChannel): string {
  const source = SOURCE_LABELS[channel.source_type] ?? ''
  if (channel.channel_type === 'temperature') {
    const zone =
      channel.zone_index === undefined ? '' : `zone_${channel.zone_index}`
    return `${zone ? zoneLabel(zone) : '未选择温区'} ${source}温度`
  }
  if (channel.channel_type === 'flow') {
    const gas = channel.gas_species?.trim() ?? ''
    return `${gas || '未填写气体'} 流量`
  }
  if (channel.channel_type === 'pressure') {
    const location = channel.pressure_location?.trim() ?? ''
    return `${location || '未填写位置'}${source}压力`
  }
  return CHANNEL_LABELS[channel.channel_type] ?? '设备条件'
}

export function timelineValidationIssue(
  segments: WorkflowSegment[],
  channels: WorkflowChannel[],
): string | null {
  if (segments.length === 0) return '请至少添加一个实验阶段。'
  if (
    !segments.some((segment) =>
      ['nucleation', 'growth'].includes(segment.segment_type),
    )
  ) {
    return '实验阶段中至少需要一项“成核”或“生长”。'
  }
  if (
    segments.some(
      (segment) =>
        !Number.isFinite(segment.start_s) ||
        !Number.isFinite(segment.end_s) ||
        segment.end_s <= segment.start_s,
    )
  ) {
    return '请检查实验阶段的开始和结束时间。'
  }
  if (channels.length === 0) {
    return '请至少添加一项温度、气体、压力或设备条件。'
  }
  const semanticKeys = channels.map((channel) =>
    [
      channel.channel_type,
      channel.subject_ref?.trim().toLocaleLowerCase(),
      channel.source_type,
    ].join('|'),
  )
  if (new Set(semanticKeys).size !== semanticKeys.length) {
    return '同一对象不能重复添加相同来源的条件；可分别记录设定值与实测值。'
  }
  for (const channel of channels) {
    const title = processChannelTitle(channel)
    if (!SOURCE_LABELS[channel.source_type]) {
      return `请为“${title}”选择数据来源。`
    }
    if (
      channel.channel_type === 'temperature' &&
      (!channel.zone_index || channel.subject_type !== 'temperature_zone')
    ) {
      return '请为温度条件选择对应温区。'
    }
    if (channel.channel_type === 'flow') {
      if (
        !channel.gas_species?.trim() ||
        channel.subject_type !== 'gas_species'
      )
        return '请填写气体种类。'
      if (!snapshotText(channel, 'controller_ref')) {
        return `请填写${title}的流量控制器或来源。`
      }
    }
    if (channel.channel_type === 'pressure') {
      if (
        !channel.pressure_location?.trim() ||
        channel.subject_type !== 'pressure_location'
      )
        return '请填写压力测量位置。'
      if (!channel.pressure_type) {
        return `请为${title}选择压力类型。`
      }
    }
    if (
      (channel.data_kind === 'scalar' && channel.scalar_value === undefined) ||
      (channel.data_kind === 'interval_series' &&
        (!channel.series?.length ||
          channel.series.some(
            (point) => point.value === '' || point.value === undefined,
          ))) ||
      (channel.data_kind === 'timeseries_file' && !channel.file_asset_id)
    ) {
      return `请补齐“${title}”的记录值。`
    }
  }
  return null
}

export function withProcessChannelSubject(
  channel: WorkflowChannel,
  patch: Partial<
    Pick<
      WorkflowChannel,
      | 'subject_type'
      | 'subject_ref'
      | 'gas_species'
      | 'zone_index'
      | 'pressure_location'
      | 'pressure_type'
    >
  >,
): WorkflowChannel {
  return { ...channel, ...patch }
}

export function peakTemperatureC(channels: WorkflowChannel[]): number | null {
  const values = channels.flatMap((channel) => {
    if (
      channel.channel_type !== 'temperature' ||
      !['°C', 'K'].includes(channel.unit ?? '')
    )
      return []
    const raw = [
      ...(typeof channel.scalar_value === 'number'
        ? [channel.scalar_value]
        : []),
      ...(channel.series ?? [])
        .map((point) => Number(point.value))
        .filter(Number.isFinite),
    ]
    return raw.map((value) => (channel.unit === 'K' ? value - 273.15 : value))
  })
  return values.length ? Math.max(...values) : null
}

type TargetSummaryInput = {
  architecture_type: string
  material_regions: Array<{ formula: string }>
  composition_relations: Array<{
    relation_type: string
    species: string
    nominal_value?: number
    value_basis: string
  }>
}

export function targetSummary(target: TargetSummaryInput): string {
  const formulas = target.material_regions
    .map((region) => region.formula.trim())
    .filter(Boolean)
  if (target.architecture_type === 'vertical_stack') return formulas.join(' / ')
  if (target.architecture_type === 'lateral_junction') return formulas.join('–')
  if (target.architecture_type === 'mixed_architecture')
    return `混合结构：${formulas.join(' / ')}`
  const relation = target.composition_relations[0]
  if (!relation) return formulas.join(' / ')
  if (relation.relation_type === 'doped_by')
    return `${relation.species} 掺杂 ${formulas[0] ?? ''}`
  if (relation.relation_type === 'substitutional_alloy') {
    const amount =
      relation.nominal_value === undefined
        ? ''
        : `（${relation.value_basis} ${relation.nominal_value}）`
    return `${formulas[0] ?? ''}–${relation.species} 取代合金${amount}`
  }
  return `${formulas[0] ?? ''} · ${relation.species}`
}

export function materialAssertionValue(
  assertionType: string,
  value: string,
  components: Array<{ species: string; fraction: string }>,
  basis: string,
): Record<string, unknown> {
  if (assertionType === 'phase_identity') return { phase: value.trim() }
  if (assertionType === 'layer_count') return { count: Number(value) }
  if (assertionType === 'composition') {
    return {
      components: components.map((component) => ({
        species: component.species.trim(),
        fraction: Number(component.fraction),
      })),
      basis,
    }
  }
  return { [assertionType]: value.trim() }
}
