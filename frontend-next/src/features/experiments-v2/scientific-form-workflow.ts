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
  data_kind: 'scalar' | 'interval_series' | 'timeseries_file'
  scalar_value?: number
  series?: Array<{ value: number | string }>
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

function keySubject(channel: WorkflowChannel): string {
  const subject = channel.channel_key.split('.').slice(1).join('.')
  return subject.startsWith('pending_') ? '' : subject
}

function zoneLabel(value: string): string {
  const match = /^zone_(\d+)$/.exec(value)
  return match ? `温区 ${match[1]}` : value
}

export function processChannelTitle(channel: WorkflowChannel): string {
  const source = SOURCE_LABELS[channel.source_type] ?? ''
  if (channel.channel_type === 'temperature') {
    const zone = snapshotText(channel, 'zone') || keySubject(channel)
    return `${zone ? zoneLabel(zone) : '未选择温区'} ${source}温度`
  }
  if (channel.channel_type === 'flow') {
    const gas = snapshotText(channel, 'gas_species') || keySubject(channel)
    return `${gas || '未填写气体'} 流量`
  }
  if (channel.channel_type === 'pressure') {
    const location =
      snapshotText(channel, 'pressure_location') || keySubject(channel)
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
  if (
    new Set(channels.map((channel) => channel.channel_key)).size !==
    channels.length
  ) {
    return '存在重复的温区、气体或压力位置；请在同一张卡片中按分时段记录。'
  }
  for (const channel of channels) {
    const title = processChannelTitle(channel)
    if (!SOURCE_LABELS[channel.source_type]) {
      return `请为“${title}”选择数据来源。`
    }
    if (channel.channel_type === 'temperature' && title.startsWith('未选择')) {
      return '请为温度条件选择对应温区。'
    }
    if (channel.channel_type === 'flow') {
      if (title.startsWith('未填写')) return '请填写气体种类。'
      if (!snapshotText(channel, 'controller_ref')) {
        return `请填写${title}的流量控制器或来源。`
      }
    }
    if (channel.channel_type === 'pressure') {
      if (title.startsWith('未填写')) return '请填写压力测量位置。'
      if (!snapshotText(channel, 'pressure_type')) {
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

export function machineToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll('₀', '0')
    .replaceAll('₁', '1')
    .replaceAll('₂', '2')
    .replaceAll('₃', '3')
    .replaceAll('₄', '4')
    .replaceAll('₅', '5')
    .replaceAll('₆', '6')
    .replaceAll('₇', '7')
    .replaceAll('₈', '8')
    .replaceAll('₉', '9')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
