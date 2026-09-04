import {
  ELEMENT_SYMBOLS,
  formatChemicalFormula,
  generateSolidSolutionFormula,
  normalizeChemicalFormula,
  validateChemicalFormula,
} from './formula'
import {
  commonSuggestedBulkSpaceGroups,
  suggestedBulkSpaceGroups,
} from './space-groups'
import { parseStructuredValue } from '@/shared/structured-field'

export function tubeUsageParts(value: string): [string, string] {
  const structured = parseStructuredValue(value)
  if ('reset_count' in structured || 'use_number_since_reset' in structured) {
    return [
      String(structured['reset_count'] ?? '').trim(),
      String(structured['use_number_since_reset'] ?? '').trim(),
    ]
  }
  const [resetCount = '', useNumber = ''] = value.split(',', 2)
  return [resetCount.trim(), useNumber.trim()]
}

export function tubeUsagePartsValidity(value: string): [boolean, boolean] {
  const [resetCount, useNumber] = tubeUsageParts(value)
  return [/^\d+$/.test(resetCount), /^[1-9]\d*$/.test(useNumber)]
}

export async function saveBeforeStepChange(
  readOnly: boolean,
  hasUnsavedChanges: boolean,
  saveCurrentStep: () => Promise<boolean>,
): Promise<boolean> {
  return readOnly || !hasUnsavedChanges || saveCurrentStep()
}

export function channelsForSetupZoneCount<
  T extends { channel_type: string; zone_index?: number },
>(channels: T[], zoneCount: number): T[] {
  return channels.filter(
    (channel) =>
      channel.channel_type !== 'temperature' ||
      Number(channel.zone_index) <= zoneCount,
  )
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
    return `${gas === 'premixed' ? '预混气总' : gas || '未选择气体'} 流量`
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
      return `系统未能匹配“${title}”，请重新选择实验装置后再试。`
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
      channel.source_type !== 'setpoint' ||
      !['°C', 'K'].includes(channel.unit ?? '')
    )
      return []
    const raw = [
      ...(typeof channel.scalar_value === 'number'
        ? [channel.scalar_value]
        : []),
      ...(channel.series ?? [])
        .filter(
          (point) =>
            point.value !== '' &&
            point.value !== null &&
            point.value !== undefined,
        )
        .map((point) => Number(point.value))
        .filter(Number.isFinite),
    ]
    return raw.map((value) => (channel.unit === 'K' ? value - 273.15 : value))
  })
  return values.length ? Math.max(...values) : null
}

type TargetSummaryInput = {
  architecture_type: string
  material_regions: Array<{
    region_key: string
    formula: string
    layer_index?: number
    target_layer_count?: number
    target_bulk_phase?: string
    target_bulk_space_group_number?: number
  }>
  composition_relations: Array<{
    relation_type: string
    host_region_key: string
    species: string
    nominal_value?: number
    value_basis: string
    site_or_location?: string
  }>
}

function phaseFormula(
  region: TargetSummaryInput['material_regions'][number],
): string {
  const formula = formatChemicalFormula(region.formula.trim())
  return [region.target_bulk_phase?.trim(), formula].filter(Boolean).join('-')
}

function siteLabel(value: string | undefined): string {
  if (!value) return ''
  if (value.endsWith('_site')) return `${value.slice(0, -5)} 位点`
  if (value.startsWith('other:')) return value.slice(6)
  return (
    {
      interstitial: '间隙位点',
      interlayer: '层间位置',
      surface: '表面位置',
      unspecified: '未指定',
    }[value] ?? value
  )
}

export function targetSummary(target: TargetSummaryInput): string {
  const regions = target.material_regions.filter((region) =>
    region.formula.trim(),
  )
  const relation = target.composition_relations[0]
  if (target.architecture_type === 'vertical_stack') {
    return [...regions]
      .sort((a, b) => (a.layer_index ?? 0) - (b.layer_index ?? 0))
      .map((region) =>
        [
          phaseFormula(region),
          region.target_layer_count ? `（${region.target_layer_count}层）` : '',
        ]
          .filter(Boolean)
          .join(''),
      )
      .filter(Boolean)
      .join(' / ')
  }
  if (target.architecture_type === 'lateral_junction') {
    const body = regions.map(phaseFormula).filter(Boolean).join('–')
    return [body, body ? '横向异质结构' : ''].filter(Boolean).join(' ')
  }
  const host = regions[0]
  if (!host) return ''
  if (relation?.relation_type === 'doped_by') {
    const value =
      relation.nominal_value === undefined
        ? undefined
        : relation.value_basis === 'mol_fraction'
          ? relation.nominal_value * 100
          : relation.nominal_value
    const amount =
      value === undefined
        ? ''
        : `${value} ${relation.value_basis === 'mol_fraction' ? 'mol.%' : 'at.%'}`
    const site = siteLabel(relation.site_or_location)
    const details = [amount, site].filter(Boolean).join('；')
    const body = [relation.species.trim(), '掺杂', phaseFormula(host)]
      .filter(Boolean)
      .join(' ')
    return details ? `${body}（${details}）` : body
  }
  return phaseFormula(host)
}

export function targetValidationIssue(
  target: TargetSummaryInput,
): string | null {
  const regions = target.material_regions
  const solidSolutionComponents = target.composition_relations.filter(
    (relation) => relation.relation_type === 'solid_solution_component',
  )
  if (solidSolutionComponents.length) {
    if (
      target.architecture_type !== 'single_region' ||
      regions.length !== 1 ||
      solidSolutionComponents.length !== target.composition_relations.length
    ) {
      return '合金必须由一个目标区域和对等的合金组分构成。'
    }
    if (solidSolutionComponents.length < 2) return '合金至少需要两个组分。'
    for (const [index, component] of solidSolutionComponents.entries()) {
      if (!component.species.trim()) {
        return `请填写组分 ${String.fromCharCode(65 + index)} 的材料化学式。`
      }
      if (!validateChemicalFormula(component.species).valid) {
        return `合金组分“${component.species}”的化学式不合法。`
      }
      if (
        component.value_basis !== 'mol_fraction' ||
        component.nominal_value === undefined ||
        !(component.nominal_value > 0 && component.nominal_value < 1)
      ) {
        return '每个合金组分都必须填写大于 0 且小于 1 的目标摩尔分数。'
      }
      if (component.site_or_location) {
        return '均匀固溶体组分不能设置被取代位点。'
      }
    }
    if (
      new Set(
        solidSolutionComponents.map((component) =>
          normalizeChemicalFormula(component.species),
        ),
      ).size !== solidSolutionComponents.length
    ) {
      return '合金组分不能重复。'
    }
    const formula = generateSolidSolutionFormula(
      solidSolutionComponents.map((component) => ({
        formula: component.species,
        fraction: component.nominal_value,
      })),
    )
    if (!formula) {
      return '请确保各组分结构兼容，且目标摩尔分数总和为 1。'
    }
    if (regions[0].formula !== formula) {
      return '合金目标组成与组分不一致，请重新填写组分。'
    }
    const phaseCandidate = commonSuggestedBulkSpaceGroups(
      solidSolutionComponents.map((component) => component.species),
    ).find((candidate) => candidate.phase === regions[0].target_bulk_phase)
    if (
      phaseCandidate &&
      phaseCandidate.number !== regions[0].target_bulk_space_group_number
    ) {
      return `合金的 ${phaseCandidate.phase} 体相必须使用 No. ${phaseCandidate.number}。`
    }
  }
  for (const region of regions) {
    const formula = region.formula.trim()
    if (!formula) return '请填写材料化学式。'
    if (!validateChemicalFormula(formula).valid) {
      return `材料化学式“${formula}”不合法。`
    }
    const phase = region.target_bulk_phase
    const spaceGroup = region.target_bulk_space_group_number
    if (phase !== undefined && !phase.trim()) {
      return '请填写自定义体相/多型。'
    }
    if (!phase && spaceGroup !== undefined) {
      return '体相为空时不能填写空间群编号。'
    }
    if (
      spaceGroup !== undefined &&
      (!Number.isInteger(spaceGroup) || spaceGroup < 1 || spaceGroup > 230)
    ) {
      return '空间群编号必须为 1–230 的整数。'
    }
    const candidate = suggestedBulkSpaceGroups(formula).find(
      (item) => item.phase === phase,
    )
    if (candidate && candidate.number !== spaceGroup) {
      return `${formula} 的 ${phase} 体相必须使用 No. ${candidate.number}。`
    }
    if (
      region.target_layer_count !== undefined &&
      (!Number.isInteger(region.target_layer_count) ||
        region.target_layer_count < 1)
    ) {
      return '目标层数必须为正整数。'
    }
  }
  if (target.architecture_type === 'vertical_stack') {
    if (regions.length < 2) return '垂直异质结构至少需要两层。'
    if (
      regions.some(
        (region) =>
          region.target_layer_count !== undefined &&
          (!Number.isInteger(region.target_layer_count) ||
            region.target_layer_count < 1),
      )
    ) {
      return '每层的目标层数必须为正整数。'
    }
    if (regions.some((region, index) => region.layer_index !== index + 1)) {
      return '垂直层序必须从 1 连续编号。'
    }
    return null
  }
  if (target.architecture_type === 'lateral_junction') {
    if (regions.length < 2) return '横向异质结构至少需要两个区域。'
    if (
      regions.some(
        (region) =>
          region.target_layer_count !== undefined &&
          (!Number.isInteger(region.target_layer_count) ||
            region.target_layer_count < 1),
      )
    ) {
      return '整体目标层数必须为正整数。'
    }
    if (new Set(regions.map((region) => region.target_layer_count)).size > 1) {
      return '横向异质结构的整体目标层数必须对所有区域一致。'
    }
    return null
  }
  const relation = target.composition_relations[0]
  if (!relation) return null
  if (relation.relation_type === 'solid_solution_component') return null
  if (!ELEMENT_SYMBOLS.includes(relation.species as never)) {
    return relation.relation_type === 'doped_by'
      ? '请选择合法的掺杂元素。'
      : '请选择合法的取代元素。'
  }
  if (relation.relation_type === 'doped_by') {
    if (
      relation.nominal_value !== undefined &&
      !['at_percent', 'mol_fraction'].includes(relation.value_basis)
    ) {
      return '掺杂含量单位只能使用 at.% 或 mol.%。'
    }
    if (
      relation.nominal_value !== undefined &&
      (relation.nominal_value <= 0 ||
        (relation.value_basis === 'at_percent' &&
          relation.nominal_value >= 100) ||
        (relation.value_basis === 'mol_fraction' &&
          relation.nominal_value >= 1))
    ) {
      return '目标含量必须大于 0 且小于 100%。'
    }
    if (relation.site_or_location === 'other:') {
      return '请填写其他目标位点。'
    }
    return null
  }
  const elements = validateChemicalFormula(regions[0].formula).elements
  const replaced = relation.site_or_location ?? ''
  if (!elements.includes(replaced)) {
    return '被取代元素必须来自基础材料化学式。'
  }
  if (replaced === relation.species) {
    return '被取代元素和取代元素不能相同。'
  }
  if (
    relation.nominal_value !== undefined &&
    !(relation.nominal_value > 0 && relation.nominal_value < 1)
  ) {
    return '目标位点分数 x 必须满足 0 < x < 1。'
  }
  if (relation.value_basis !== 'site_fraction') {
    return '合金目标含量必须使用位点分数。'
  }
  return null
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
