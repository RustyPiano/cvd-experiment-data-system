export function tubeUsageParts(value: string): [string, string] {
  const [resetCount = '', useNumber = ''] = value.split(',', 2)
  return [resetCount.trim(), useNumber.trim()]
}

export async function saveBeforeStepChange(
  readOnly: boolean,
  hasUnsavedChanges: boolean,
  saveCurrentStep: () => Promise<boolean>,
): Promise<boolean> {
  return readOnly || !hasUnsavedChanges || saveCurrentStep()
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
  subject_instance_ref?: string
  gas_species_code?: string
  zone_index?: number
  pressure_location?: string
  pressure_type?: string
  unit?: string
  data_kind: 'scalar' | 'interval_series' | 'timeseries_file'
  scalar_value?: number
  series?: Array<{ start_s: number; end_s?: number; value: number | string }>
  file_asset_id?: string
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
    const gas = channel.gas_species_code?.trim() ?? ''
    return `${gas || '未选择气体'} 流量`
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
      channel.subject_instance_ref?.trim().toLocaleLowerCase(),
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
    if (!channel.subject_instance_ref?.trim()) {
      return `请填写“${title}”对应的物理通道实例。`
    }
    if (
      channel.channel_type === 'temperature' &&
      (!channel.zone_index || channel.subject_type !== 'temperature_zone')
    ) {
      return '请为温度条件选择对应温区。'
    }
    if (channel.channel_type === 'flow') {
      if (
        !channel.gas_species_code?.trim() ||
        channel.subject_type !== 'gas_species'
      )
        return '请选择气体种类。'
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
      | 'subject_instance_ref'
      | 'gas_species_code'
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
  material_regions: Array<{ region_key: string; formula: string }>
  composition_relations: Array<{
    relation_type: string
    host_region_key: string
    species: string
    nominal_value?: number
    value_basis: string
  }>
}

export function targetSummary(target: TargetSummaryInput): string {
  const formulas = target.material_regions
    .map((region) => region.formula.trim())
    .filter(Boolean)
  const relations = target.composition_relations.map((relation) => {
    const host =
      target.material_regions.find(
        (region) => region.region_key === relation.host_region_key,
      )?.formula ?? relation.host_region_key
    const amount =
      relation.nominal_value === undefined
        ? ''
        : ` ${relation.value_basis} ${relation.nominal_value}`
    const action =
      relation.relation_type === 'doped_by'
        ? '掺杂'
        : relation.relation_type === 'substitutional_alloy'
          ? '取代合金'
          : relation.relation_type === 'intercalated_by'
            ? '插层'
            : '表面修饰'
    return `${host}：${relation.species} ${action}${amount}`
  })
  const base =
    target.architecture_type === 'vertical_stack'
      ? formulas.join(' / ')
      : target.architecture_type === 'lateral_junction'
        ? formulas.join('–')
        : target.architecture_type === 'mixed_architecture'
          ? `混合结构：${formulas.join(' / ')}`
          : formulas.join(' / ')
  return relations.length ? `${base}；${relations.join('；')}` : base
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
