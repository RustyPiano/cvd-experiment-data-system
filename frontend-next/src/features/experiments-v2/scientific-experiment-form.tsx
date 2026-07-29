import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

import type { V2EntityRead } from '@/features/entity-library/api'
import { useAuth } from '@/features/auth/use-auth'
import {
  deleteExperimentFile,
  getExperimentFile,
  uploadExperimentFile,
} from '@/features/samples/api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  characterizationProfiles,
  characterizationProperties,
  gasSpecies,
} from '@/shared/generated/field-metadata'
import {
  createMeasurement,
  createRun,
  listContainerInstances,
  listContributors,
  listMeasurements,
  listSamples,
  setSetupReference,
  upsertModule,
} from './api'
import type { V2ModulePayloadRead } from './api'
import type { ExperimentV2FormState } from './form-types'
import { buildItemsModulePayload, moduleValueAsString } from './field-logic'
import {
  materialAssertionValue,
  peakTemperatureC,
  processChannelTitle,
  saveBeforeStepChange,
  targetSummary,
  timelineValidationIssue,
  tubeUsageParts,
  withProcessChannelSubject,
} from './scientific-form-workflow'
import { ModuleCard } from './components/module-card'
import { EntityReferenceSelect } from './components/entity-reference-select'
import { materialLotProjectedItem } from './components/repeatable-items-section'
import {
  SimpleGrowthEditor,
  SimpleSourceLoadsEditor,
  SimpleSubstratesEditor,
  SimpleTargetEditor,
} from './simple-preparation-editors'
import type {
  SimpleProcessSettings,
  SimpleTarget,
} from './simple-preparation-editors'
import {
  buildSimpleSourceLoadsPayload,
  simpleGrowthIssue,
} from './simple-form-adapters'

type Region = {
  region_key: string
  formula: string
  spatial_role: 'single_region' | 'layer' | 'lateral_region' | 'mixed_region'
  layer_index?: number
  lateral_region?: string
  target_layer_count?: number
  target_bulk_phase?: string
}

type CompositionRelation = {
  relation_type:
    | 'doped_by'
    | 'substitutional_alloy'
    | 'intercalated_by'
    | 'decorated_by'
  host_region_key: string
  species: string
  nominal_value?: number
  value_basis:
    | 'at_percent'
    | 'mol_fraction'
    | 'site_fraction'
    | 'ratio'
    | 'unspecified'
  site_or_location?: string
}

type TargetSpec = {
  architecture_type:
    | 'single_region'
    | 'vertical_stack'
    | 'lateral_junction'
    | 'mixed_architecture'
  material_regions: Region[]
  composition_relations: CompositionRelation[]
  dimensional_form?:
    | 'sheet'
    | 'ribbon'
    | 'wire'
    | 'tube'
    | 'rod'
    | 'particle'
    | 'other'
  coverage_state?: 'isolated' | 'discontinuous' | 'percolated' | 'continuous'
  orientation?: 'in_plane' | 'vertical' | 'mixed'
  optimization_objective?: string
  note?: string
}

type Ingredient = {
  material_lot_id: string
  material_lot_version: number
  function_role: string
  amount?: number
  unit?: string
  snapshot?: Record<string, unknown>
}

type SourceLoad = {
  load_key: string
  container_instance_id?: string
  loading_method: string
  preparation_steps: Array<{
    step_type: string
    sequence: number
    parameters: Record<string, unknown>
  }>
  initial_position?: {
    axial_mm: number
    radial_mm?: number
    azimuth_deg?: number
    reference: 'setup_origin'
  }
  position_program: Array<{
    t_s: number
    axial_mm: number
    radial_mm?: number
    azimuth_deg?: number
    reference: 'setup_origin'
  }>
  heating_zone_ref?: string
  ingredients: Ingredient[]
}

type Segment = {
  segment_key: string
  segment_type: string
  sequence: number
  start_s: number
  end_s: number
  label?: string
  note?: string
}

type Channel = {
  channel_key: string
  channel_type: string
  source_type: string
  subject_type: string
  subject_ref: string
  subject_instance_ref: string
  subject_snapshot?: Record<string, unknown>
  gas_species_code?: string
  gas_lot_id?: string
  gas_lot_version?: number
  zone_index?: number
  pressure_location?: string
  pressure_type?: string
  unit: string
  data_kind: 'scalar' | 'interval_series' | 'timeseries_file'
  scalar_value?: number
  series?: Array<{ start_s: number; end_s?: number; value: number | string }>
  file_asset_id?: string
}

type ProcessEvent = {
  event_key: string
  start_s: number
  end_s?: number
  observed_deviations: string[]
  intervention_actions: string[]
  affected_objects: string[]
  suspected_causes: string[]
  outcome?: string
  data_validity_impact?: string
  excluded_time_ranges: Array<{ start_s: number; end_s: number }>
  description?: string
  attachment_file_ids: string[]
}
type AmbientSource =
  | 'room_sensor'
  | 'setup_sensor'
  | 'manual_entry'
  | 'manual_estimate'
  | 'not_measured'
type AmbientFormValue = {
  value?: number
  measured_at?: string
  source_type: AmbientSource
  sensor_ref?: string
}
type BasicInfo = {
  started_at: string
  synthesis_method: 'CVD'
  run_code: string
  created_by_user_id: string
  performed_by_user_ids: string[]
  recorded_by_user_id: string
  ambient_temperature?: AmbientFormValue
  ambient_humidity?: AmbientFormValue
  note?: string
  precheck: Record<string, unknown>
}

const DEFAULT_TARGET: TargetSpec = {
  architecture_type: 'single_region',
  material_regions: [
    {
      region_key: 'film',
      formula: '',
      spatial_role: 'single_region',
    },
  ],
  composition_relations: [],
}

const EMPTY_TIMELINE = {
  segments: [] satisfies Segment[],
  channels: [] satisfies Channel[],
}

const PROPERTY_UNITS = Object.fromEntries(
  Object.entries(characterizationProperties).map(([code, item]) => [
    code,
    item.unit,
  ]),
)
const PROPERTY_LABELS = Object.fromEntries(
  Object.entries(characterizationProperties).map(([code, item]) => [
    code,
    item.label_zh,
  ]),
)
const METHOD_PROPERTY_CODES = Object.fromEntries(
  Object.entries(characterizationProfiles).map(([code, item]) => [
    code,
    item.allowed_property_codes,
  ]),
)
const METHOD_DEFAULT_PROPERTIES = Object.fromEntries(
  Object.entries(characterizationProfiles).map(([code, item]) => [
    code,
    item.default_property_codes,
  ]),
)
const METHOD_GEOMETRIES = Object.fromEntries(
  Object.entries(characterizationProfiles).map(([code, item]) => [
    code,
    item.allowed_region_types,
  ]),
)
const GEOMETRY_LABELS: Record<string, string> = {
  point: '点测量',
  line: '线扫',
  area: '矩形区域',
  whole_sample: '整片样品',
  lamella: '薄片',
  particle: '颗粒',
  selected_area: '选区',
}
const PROCESS_UNITS: Record<string, string[]> = {
  temperature: ['°C', 'K'],
  flow: ['sccm', 'slm'],
  pressure: ['Pa', 'kPa', 'mbar', 'Torr', 'bar', 'atm'],
  valve_state: ['state'],
  source_position: ['mm', 'cm', 'm'],
  furnace_position: ['mm', 'cm', 'm'],
  plasma_power: ['W', 'kW'],
  shutter_state: ['state'],
}
const CHANNEL_LABELS: Record<string, string> = {
  temperature: '温度',
  flow: '气体流量',
  pressure: '压力',
  valve_state: '阀门状态',
  source_position: '源位置',
  furnace_position: '炉体位置',
  plasma_power: '等离子体功率',
  shutter_state: '挡板状态',
}
const SEGMENT_LABELS: Record<string, string> = {
  purge: '吹扫',
  ramp: '升降温',
  nucleation: '成核',
  growth: '生长',
  anneal: '退火',
  cooling: '冷却',
  transfer: '转移',
  other: '其他',
}
const LOADING_METHOD_LABELS: Record<string, string> = {
  boat: '舟',
  crucible: '坩埚',
  substrate_surface: '衬底表面',
  gas_line: '气路',
  bubbler: '鼓泡瓶',
  other: '其他',
}
const PREPARATION_STEP_LABELS: Record<string, string> = {
  direct_load: '直接装载',
  grind: '研磨',
  mix: '混合',
  pelletize: '压片',
  spin_coat: '旋涂',
  pre_anneal: '预退火',
  other: '其他',
}
const INGREDIENT_ROLE_LABELS: Record<string, string> = {
  metal_source: '金属源',
  chalcogen_source: '硫族元素源',
  carbon_source: '碳源',
  dopant_source: '掺杂源',
  promoter: '促进剂',
  transport_agent: '输运剂',
  etchant: '刻蚀剂',
  reducing_agent: '还原剂',
  oxidizing_agent: '氧化剂',
  carrier_gas: '载气',
  other: '其他',
}
const CONTAINER_STATUS_LABELS: Record<string, string> = {
  available: '可用',
  in_use: '使用中',
  empty: '已空',
  quarantined: '隔离',
  disposed: '已处置',
}
const SAMPLE_ACTUAL_STATE_LABELS: Record<string, string> = {
  unknown: '尚无实际结论',
  growth_present: '观察到生长',
  no_growth: '未观察到生长',
  uncertain: '结论不确定',
  asserted: '已确认材料结论',
}
const EVENT_OPTIONS = {
  observed_deviations: [
    ['line_blockage', '管路堵塞'],
    ['pressure_excursion', '压力突变'],
    ['signal_anomaly', '信号异常'],
    ['manual_intervention', '人工干预'],
    ['equipment_alarm', '设备报警'],
    ['manual_stop', '人工停止'],
    ['power_interruption', '供电中断'],
    ['water_interruption', '供水中断'],
    ['gas_interruption', '供气中断'],
    ['plan_changed', '计划变更'],
  ],
  intervention_actions: [
    ['adjust_flow', '调整流量'],
    ['adjust_pressure', '调整压力'],
    ['adjust_temperature', '调整温度'],
    ['restart_supply', '恢复供应'],
    ['inspect_equipment', '检查设备'],
    ['stop_run', '停止实验'],
    ['other', '其他'],
  ],
  affected_objects: [
    ['source_load', '装料'],
    ['gas_line', '气路'],
    ['furnace', '炉体'],
    ['substrate', '衬底'],
    ['sample', '样品'],
    ['process_channel', '过程通道'],
    ['instrument', '仪器'],
    ['other', '其他'],
  ],
  suspected_causes: [
    ['line_blockage', '管路堵塞'],
    ['equipment_fault', '设备故障'],
    ['utility_interruption', '水/电/气供应中断'],
    ['operator_action', '人员操作'],
    ['process_instability', '过程不稳定'],
    ['unknown', '原因未知'],
    ['other', '其他'],
  ],
} satisfies Record<string, ReadonlyArray<readonly [string, string]>>
const METHOD_LABELS = Object.fromEntries(
  Object.entries(characterizationProfiles).map(([code, item]) => [
    code,
    item.label_zh,
  ]),
)
const REGION_LABELS: Record<string, string> = {
  label: '测量区域名称',
  x: '横坐标',
  y: '纵坐标',
  width: '长度或区域宽度',
  height: '区域高度',
  unit: '坐标单位',
}

const WORKFLOW_STEPS = [
  '基本信息',
  '目标材料',
  '装置与前驱体',
  '衬底与摆放',
  '生长条件',
  '检查并提交',
] as const

const STEP_MODULES = [
  ['basic_info'],
  ['target_product'],
  ['equipment', 'precursors'],
  ['substrates'],
  ['process_steps', 'process_events'],
  [],
] as const

const PRESSURE_REGIME_LABELS: Record<string, string> = {
  atmospheric: '常压',
  low_pressure: '低压',
  other: '其他',
}

function stepForModule(module: string): number {
  if (['characterization', 'measured_products'].includes(module)) return 5
  const index = STEP_MODULES.findIndex((modules) =>
    (modules as readonly string[]).includes(module),
  )
  return index < 0 ? 0 : index
}

function targetExample(target: TargetSpec): {
  title: string
  rows: Array<[string, string]>
  value: TargetSpec
} {
  if (target.architecture_type === 'mixed_architecture') {
    return {
      title: '垂直与横向并存的混合结构',
      rows: [
        ['材料 1', 'MoS₂'],
        ['材料 2', 'WS₂'],
        ['结构说明', 'MoS₂ 位于 WS₂ 上层，横向连接区域为 A–B'],
      ],
      value: {
        ...target,
        architecture_type: 'mixed_architecture',
        material_regions: [
          {
            region_key: 'region_1',
            formula: 'MoS2',
            spatial_role: 'mixed_region',
          },
          {
            region_key: 'region_2',
            formula: 'WS2',
            spatial_role: 'mixed_region',
          },
        ],
        composition_relations: [],
        note: 'MoS₂ 位于 WS₂ 上层，横向连接区域为 A–B。',
      },
    }
  }
  if (target.architecture_type === 'vertical_stack') {
    return {
      title: 'MoS₂ / WS₂ 垂直异质结构',
      rows: [
        ['材料 1', 'MoS₂ · 第 1 层（靠近衬底）'],
        ['材料 2', 'WS₂ · 第 2 层'],
        ['系统摘要', 'MoS₂ / WS₂'],
      ],
      value: {
        ...target,
        architecture_type: 'vertical_stack',
        material_regions: [
          {
            region_key: 'layer_1',
            formula: 'MoS2',
            spatial_role: 'layer',
            layer_index: 1,
          },
          {
            region_key: 'layer_2',
            formula: 'WS2',
            spatial_role: 'layer',
            layer_index: 2,
          },
        ],
        composition_relations: [],
      },
    }
  }
  if (target.architecture_type === 'lateral_junction') {
    return {
      title: 'MoS₂–WS₂ 横向异质结构',
      rows: [
        ['区域 A', 'MoS₂'],
        ['区域 B', 'WS₂'],
        ['系统摘要', 'MoS₂–WS₂'],
      ],
      value: {
        ...target,
        architecture_type: 'lateral_junction',
        material_regions: [
          {
            region_key: 'region_a',
            formula: 'MoS2',
            spatial_role: 'lateral_region',
            lateral_region: 'A',
          },
          {
            region_key: 'region_b',
            formula: 'WS2',
            spatial_role: 'lateral_region',
            lateral_region: 'B',
          },
        ],
        composition_relations: [],
      },
    }
  }
  if (
    target.composition_relations.some(
      (relation) => relation.relation_type === 'doped_by',
    )
  ) {
    return {
      title: 'Pt 掺杂 MoS₂',
      rows: [
        ['主体材料', 'MoS₂'],
        ['掺杂设置', 'Pt · 1 at% · Mo 位点'],
        ['含量表示方式', '原子百分比'],
      ],
      value: {
        ...target,
        architecture_type: 'single_region',
        material_regions: [
          {
            region_key: 'film',
            formula: 'MoS2',
            spatial_role: 'single_region',
          },
        ],
        composition_relations: [
          {
            relation_type: 'doped_by',
            host_region_key: 'film',
            species: 'Pt',
            nominal_value: 1,
            value_basis: 'at_percent',
            site_or_location: 'Mo 位点',
          },
        ],
      },
    }
  }
  if (
    target.composition_relations.some(
      (relation) => relation.relation_type === 'substitutional_alloy',
    )
  ) {
    return {
      title: 'Mo–W–S 合金',
      rows: [
        ['主体材料', 'MoS₂'],
        ['取代设置', 'W · 0.5 · Mo 位点'],
        ['含量表示方式', '位点分数'],
      ],
      value: {
        ...target,
        architecture_type: 'single_region',
        material_regions: [
          {
            region_key: 'film',
            formula: 'MoS2',
            spatial_role: 'single_region',
          },
        ],
        composition_relations: [
          {
            relation_type: 'substitutional_alloy',
            host_region_key: 'film',
            species: 'W',
            nominal_value: 0.5,
            value_basis: 'site_fraction',
            site_or_location: 'Mo 位点',
          },
        ],
      },
    }
  }
  return {
    title: '单一材料 MoS₂',
    rows: [
      ['材料 1', 'MoS₂'],
      ['材料结构', '单一材料'],
      ['说明', '实际样品结论在表征记录中填写'],
    ],
    value: {
      ...target,
      architecture_type: 'single_region',
      material_regions: [
        {
          region_key: 'film',
          formula: 'MoS2',
          spatial_role: 'single_region',
        },
      ],
      composition_relations: [],
    },
  }
}

function targetForArchitecture(
  target: TargetSpec,
  architecture: TargetSpec['architecture_type'],
): TargetSpec {
  return {
    ...target,
    architecture_type: architecture,
    material_regions: target.material_regions.map((region, index) => ({
      ...region,
      spatial_role:
        architecture === 'single_region'
          ? 'single_region'
          : architecture === 'vertical_stack'
            ? 'layer'
            : architecture === 'lateral_junction'
              ? 'lateral_region'
              : 'mixed_region',
      layer_index: architecture === 'vertical_stack' ? index + 1 : undefined,
      lateral_region:
        architecture === 'lateral_junction'
          ? region.lateral_region || String.fromCharCode(65 + index)
          : undefined,
    })),
  }
}

function numberOrUndefined(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value)
}

function machineKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '_')}`
}

function ambientComplete(value: AmbientFormValue | undefined): boolean {
  return (
    value === undefined ||
    value.source_type === 'not_measured' ||
    (value.value !== undefined &&
      Boolean(value.measured_at) &&
      (['manual_entry', 'manual_estimate'].includes(value.source_type) ||
        Boolean(value.sensor_ref?.trim())))
  )
}

function ambientPayload(value: AmbientFormValue | undefined) {
  if (!value || value.source_type === 'not_measured') {
    return { source_type: 'not_measured' as const }
  }
  if (!ambientComplete(value)) return undefined
  return {
    value: value.value!,
    measured_at: value.measured_at!,
    source_type: value.source_type,
    ...(value.sensor_ref?.trim()
      ? { sensor_ref: value.sensor_ref.trim() }
      : {}),
  }
}

function toLocalDateTime(value: string | undefined): string {
  if (!value) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function modulePayload<T>(
  modules: Record<string, V2ModulePayloadRead | null> | undefined,
  key: string,
  fallback: T,
): T {
  return (modules?.[key]?.payload_json as T | undefined) ?? fallback
}

function AmbientEditor({
  label,
  unit,
  value,
  disabled,
  onChange,
}: {
  label: string
  unit: string
  value: AmbientFormValue | undefined
  disabled: boolean
  onChange: (value: AmbientFormValue | undefined) => void
}) {
  return (
    <fieldset className="grid gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <Select
        value={value?.source_type ?? 'not_measured'}
        disabled={disabled}
        onValueChange={(source) =>
          onChange(
            source === 'not_measured'
              ? { source_type: 'not_measured' }
              : {
                  ...value,
                  source_type: source as AmbientSource,
                  measured_at: value?.measured_at ?? new Date().toISOString(),
                  ...(source === 'manual_estimate'
                    ? { sensor_ref: undefined }
                    : {}),
                },
          )
        }
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="not_measured">未测量</SelectItem>
          <SelectItem value="room_sensor">实测（室内传感器）</SelectItem>
          <SelectItem value="setup_sensor">实测（装置传感器）</SelectItem>
          <SelectItem value="manual_estimate">估计</SelectItem>
        </SelectContent>
      </Select>
      {value && value.source_type !== 'not_measured' ? (
        <>
          <Input
            type="number"
            value={value.value ?? ''}
            disabled={disabled}
            placeholder={`数值（${unit}）`}
            onChange={(event) =>
              onChange({
                ...value,
                value: numberOrUndefined(event.target.value),
              })
            }
          />
          <Input
            type="datetime-local"
            value={toLocalDateTime(value.measured_at)}
            disabled={disabled}
            aria-label={`${label}读取时间`}
            onChange={(event) =>
              onChange({
                ...value,
                measured_at: event.target.value
                  ? new Date(event.target.value).toISOString()
                  : undefined,
              })
            }
          />
          {value.source_type === 'manual_estimate' ? (
            <div className="flex items-center text-xs text-muted-foreground">
              估计值不绑定设备
            </div>
          ) : (
            <Input
              value={value.sensor_ref ?? ''}
              disabled={disabled}
              placeholder="传感器编号/位置"
              onChange={(event) =>
                onChange({ ...value, sensor_ref: event.target.value })
              }
            />
          )}
        </>
      ) : null}
    </fieldset>
  )
}

export function ScientificExperimentForm({
  mode,
  runId,
  runCode,
  runStatus,
  initialState,
  modules,
  processReadOnly = false,
  focusModule,
  onRequestLock,
  onProcessDirtyChange,
  onDirtyChange,
}: {
  mode: 'new' | 'edit'
  runId?: string
  runCode?: string
  runStatus?: string
  initialState: ExperimentV2FormState
  modules?: Record<string, V2ModulePayloadRead | null>
  processReadOnly?: boolean
  focusModule?: string | null
  onRequestLock?: () => void
  onProcessDirtyChange?: (dirty: boolean) => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const { session } = useAuth()
  const token = session.accessToken || ''
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [activeStep, setActiveStep] = useState(0)
  const canAddMeasurements = ['locked', 'reviewed'].includes(runStatus ?? '')

  const [startedAt, setStartedAt] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16),
  )
  const [formula, setFormula] = useState('')
  const [objective, setObjective] = useState('')
  const [temperatureAmbient, setTemperatureAmbient] = useState<
    AmbientFormValue | undefined
  >()
  const [humidityAmbient, setHumidityAmbient] = useState<
    AmbientFormValue | undefined
  >()
  const [precheck, setPrecheck] = useState(false)

  const [target, setTarget] = useState<TargetSpec>(() => {
    const loaded = modulePayload<Partial<TargetSpec>>(
      modules,
      'target_product',
      {},
    )
    const regions = loaded.material_regions
    return {
      ...DEFAULT_TARGET,
      ...loaded,
      material_regions:
        regions && regions.length > 0
          ? regions
          : DEFAULT_TARGET.material_regions,
      composition_relations: loaded.composition_relations ?? [],
    }
  })
  const [targetSelected, setTargetSelected] = useState(
    Boolean(modules?.['target_product']),
  )
  const [loads, setLoads] = useState<SourceLoad[]>(
    () =>
      modulePayload<{ items: SourceLoad[] }>(modules, 'precursors', {
        items: [],
      }).items,
  )
  const [segments, setSegments] = useState<Segment[]>(
    () => modulePayload(modules, 'process_steps', EMPTY_TIMELINE).segments,
  )
  const [channels, setChannels] = useState<Channel[]>(
    () => modulePayload(modules, 'process_steps', EMPTY_TIMELINE).channels,
  )
  const [processSettings, setProcessSettings] = useState<SimpleProcessSettings>(
    () => {
      const payload = modulePayload<Record<string, unknown>>(
        modules,
        'process_steps',
        {},
      )
      return {
        pressure_regime: payload[
          'pressure_regime'
        ] as SimpleProcessSettings['pressure_regime'],
        cooling_method: payload[
          'cooling_method'
        ] as SimpleProcessSettings['cooling_method'],
        cooling_other: payload['cooling_other'] as string | undefined,
        external_fields: payload['external_fields'] as string[] | undefined,
      }
    },
  )
  const [events, setEvents] = useState<ProcessEvent[]>(
    () =>
      modulePayload<{ items: ProcessEvent[] }>(modules, 'process_events', {
        items: [],
      }).items,
  )
  const [substrates, setSubstrates] = useState(initialState.substrates)
  const [equipment, setEquipment] = useState(initialState.equipment)
  const [basicInfo, setBasicInfo] = useState<BasicInfo>(() =>
    modulePayload(modules, 'basic_info', {
      started_at: new Date().toISOString(),
      synthesis_method: 'CVD',
      run_code: runCode ?? '',
      created_by_user_id: session.currentUser?.id ?? '',
      performed_by_user_ids: session.currentUser?.id
        ? [session.currentUser.id]
        : [],
      recorded_by_user_id: session.currentUser?.id ?? '',
      precheck: {},
    }),
  )
  const contributors = useQuery({
    queryKey: ['contributors', token],
    queryFn: () => listContributors(token),
    enabled: mode === 'edit' && Boolean(token),
  })

  useEffect(() => {
    if (focusModule) setActiveStep(stepForModule(focusModule))
  }, [focusModule])

  useEffect(() => {
    const hasUnsavedChanges = dirty.size > 0
    onProcessDirtyChange?.(hasUnsavedChanges)
    onDirtyChange?.(hasUnsavedChanges)
  }, [dirty, onDirtyChange, onProcessDirtyChange])

  const markDirty = (key: string) => {
    setDirty((current) => {
      const next = new Set(current).add(key)
      return next
    })
    setSaved((current) => {
      const updated = new Set(current)
      updated.delete(key)
      return updated
    })
  }

  const clearDirty = (key: string) => {
    setDirty((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
    setSaved((current) => new Set(current).add(key))
  }

  const save = async (key: string, payload: Record<string, unknown>) => {
    if (!runId) return false
    setSavingKey(key)
    setErrors((current) => ({ ...current, [key]: '' }))
    try {
      if (key === 'equipment') {
        const [resetCount, useNumber] = tubeUsageParts(
          equipment.tubeUsageHistory,
        ).map(Number)
        await setSetupReference(
          runId,
          equipment.setupId,
          equipment.version as number,
          {
            reset_count: resetCount,
            use_number_since_reset: useNumber,
          },
          token,
        )
      } else {
        await upsertModule(runId, key, payload, token)
      }
      clearDirty(key)
      await queryClient.invalidateQueries({
        queryKey: ['v2-experiment', runId, token],
      })
      toast.success('草稿已保存')
      return true
    } catch (error) {
      const message = resolveErrorMessage(error, '保存失败，请检查本节字段')
      setErrors((current) => ({ ...current, [key]: message }))
      toast.error(message)
      return false
    } finally {
      setSavingKey(null)
    }
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createRun(
        {
          started_at: new Date(startedAt).toISOString(),
          synthesis_method: 'CVD',
          ambient_temperature: ambientPayload(temperatureAmbient),
          ambient_humidity: ambientPayload(humidityAmbient),
          precheck_confirmed: precheck,
          chemical_formula: formula.trim() || null,
          objective: objective.trim() || null,
        },
        token,
      ),
    onSuccess: (run) =>
      navigate({
        to: '/experiments/$runId/edit',
        params: { runId: run.id },
      }),
    onError: (error) =>
      toast.error(resolveErrorMessage(error, '创建制备记录失败')),
  })

  if (mode === 'new') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>新建制备实验</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="scientific-started-at">开始时间</Label>
            <Input
              id="scientific-started-at"
              type="datetime-local"
              value={startedAt}
              onChange={(event) => setStartedAt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>合成方法</Label>
            <Input value="CVD" readOnly />
            <p className="text-xs text-muted-foreground">
              具体压力、温度和气体条件稍后在生长程序中填写。
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scientific-formula">目标材料</Label>
            <Input
              id="scientific-formula"
              value={formula}
              onChange={(event) => setFormula(event.target.value)}
              placeholder="MoS2"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scientific-objective">本炉研究目的</Label>
            <Input
              id="scientific-objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
            />
          </div>
          <AmbientEditor
            label="环境温度"
            unit="℃"
            value={temperatureAmbient}
            disabled={false}
            onChange={setTemperatureAmbient}
          />
          <AmbientEditor
            label="环境相对湿度"
            unit="%RH"
            value={humidityAmbient}
            disabled={false}
            onChange={setHumidityAmbient}
          />
          <label className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              checked={precheck}
              onCheckedChange={(checked) => setPrecheck(checked === true)}
            />
            已完成实验前检查
          </label>
          <div className="sm:col-span-2">
            <Button
              type="button"
              disabled={
                !startedAt ||
                !precheck ||
                !ambientComplete(temperatureAmbient) ||
                !ambientComplete(humidityAmbient) ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              创建实验并继续
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const setupZoneCount = Number(equipment.snapshot?.['zone_count']) || null
  const [tubeResetCount, tubeUseNumber] = tubeUsageParts(
    equipment.tubeUsageHistory,
  )
  const targetDisplay = targetSummary(target)
  const setupName = String(
    equipment.snapshot?.['setup_name'] ??
      equipment.snapshot?.['name'] ??
      equipment.snapshot?.['setup_code'] ??
      '',
  )
  const totalDuration = Math.max(0, ...segments.map((segment) => segment.end_s))
  const peakTemperature = peakTemperatureC(channels)
  const hasTemperatureFile = channels.some(
    (channel) =>
      channel.channel_type === 'temperature' &&
      channel.data_kind === 'timeseries_file',
  )
  const processTimelineIssue =
    simpleGrowthIssue(segments, channels, processSettings, setupZoneCount) ??
    timelineValidationIssue(segments, channels)
  const basicComplete = Boolean(
    basicInfo.started_at &&
    !Number.isNaN(new Date(basicInfo.started_at).getTime()) &&
    basicInfo.performed_by_user_ids.length &&
    Number.isFinite(basicInfo.ambient_temperature?.value) &&
    Number.isFinite(basicInfo.ambient_humidity?.value) &&
    (basicInfo.ambient_humidity?.value ?? -1) >= 0 &&
    (basicInfo.ambient_humidity?.value ?? 101) <= 100,
  )
  const targetComplete = Boolean(
    targetSelected &&
    target.material_regions.length &&
    target.material_regions.every((region) => region.formula.trim()) &&
    target.composition_relations.every((relation) => relation.species.trim()),
  )
  const preparationComplete = Boolean(
    equipment.setupId &&
    loads.length &&
    loads.every(
      (load) =>
        load.loading_method &&
        load.ingredients.length &&
        load.ingredients.every(
          (ingredient) =>
            ingredient.material_lot_id &&
            ingredient.function_role &&
            ((ingredient.amount === undefined && !ingredient.unit?.trim()) ||
              (ingredient.amount !== undefined &&
                Boolean(ingredient.unit?.trim()))),
        ),
    ),
  )
  const substratesComplete = Boolean(
    substrates.length &&
    substrates.every((item) => {
      let placement: Record<string, unknown> = {}
      try {
        placement = JSON.parse(
          moduleValueAsString(item['size_placement']) || '{}',
        ) as Record<string, unknown>
      } catch {
        return false
      }
      const axialPosition = moduleValueAsString(
        item['axial_position_mm'],
      ).trim()
      return Boolean(
        moduleValueAsString(item['lot_ref']) &&
        Number(placement.length_mm) > 0 &&
        Number(placement.width_mm) > 0 &&
        placement.placement &&
        axialPosition &&
        Number.isFinite(Number(axialPosition)),
      )
    }),
  )
  const completedSteps = [
    basicComplete,
    targetComplete,
    preparationComplete,
    substratesComplete,
    processTimelineIssue === null,
  ].filter(Boolean).length

  const payloadFor = (key: string): Record<string, unknown> => {
    if (key === 'basic_info') return basicInfo
    if (key === 'target_product') return target
    if (key === 'precursors') return buildSimpleSourceLoadsPayload(loads)
    if (key === 'substrates') {
      return buildItemsModulePayload(
        'substrates',
        substrates.map((item) => materialLotProjectedItem('substrates', item)),
      )
    }
    if (key === 'process_steps') {
      return { segments, channels, ...processSettings }
    }
    if (key === 'process_events') return { items: events }
    return {}
  }

  const saveCurrentStep = async () => {
    if (activeStep === 0 && !basicComplete) {
      setErrors((current) => ({
        ...current,
        basic_info: '请填写开始时间、至少一名实验人员以及有效的温湿度。',
      }))
      return false
    }
    if (activeStep === 1 && !targetComplete) {
      setErrors((current) => ({
        ...current,
        target_product: '请补齐目标材料类型和材料化学式。',
      }))
      return false
    }
    if (activeStep === 2 && !preparationComplete) {
      setErrors((current) => ({
        ...current,
        equipment: '请选择实验装置，并补齐每个前驱体容器中的必填信息。',
      }))
      return false
    }
    if (activeStep === 3 && !substratesComplete) {
      setErrors((current) => ({
        ...current,
        substrates: '请补齐每片衬底的批次、尺寸、轴向位置和生长面朝向。',
      }))
      return false
    }
    if (activeStep === 4 && processTimelineIssue) {
      setErrors((current) => ({
        ...current,
        process_steps: processTimelineIssue,
      }))
      return false
    }
    const keys = STEP_MODULES[activeStep].filter((key) => dirty.has(key))
    for (const key of keys) {
      if (!(await save(key, payloadFor(key)))) return false
    }
    return true
  }

  const currentError = STEP_MODULES[activeStep]
    .map((key) => errors[key])
    .find(Boolean)
  const currentStepDirty = STEP_MODULES[activeStep].some((key) =>
    dirty.has(key),
  )
  const currentStepSaved =
    !currentStepDirty && STEP_MODULES[activeStep].some((key) => saved.has(key))
  const precheckConfirmed = basicInfo.precheck?.['confirmed'] === true

  const showNextStep = async () => {
    if (
      await saveBeforeStepChange(
        processReadOnly,
        activeStep < WORKFLOW_STEPS.length - 1,
        saveCurrentStep,
      )
    ) {
      setActiveStep((current) =>
        Math.min(current + 1, WORKFLOW_STEPS.length - 1),
      )
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const showStep = async (index: number) => {
    if (index === activeStep) return
    if (index < activeStep) {
      setActiveStep(index)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (await saveBeforeStepChange(processReadOnly, true, saveCurrentStep)) {
      setActiveStep(index)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  const submitExperiment = async () => {
    if (!precheckConfirmed) return
    const incompleteStep = [
      basicComplete,
      targetComplete,
      preparationComplete,
      substratesComplete,
      processTimelineIssue === null,
    ].findIndex((complete) => !complete)
    if (incompleteStep >= 0) {
      setActiveStep(incompleteStep)
      toast.error('请先补齐对应步骤中的必填内容。')
      return
    }
    for (const key of [
      'basic_info',
      'target_product',
      'equipment',
      'precursors',
      'substrates',
      'process_steps',
      'process_events',
    ]) {
      if (dirty.has(key) && !(await save(key, payloadFor(key)))) return
    }
    onRequestLock?.()
  }

  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between gap-4">
            <CardTitle>
              当前：第 {activeStep + 1}/{WORKFLOW_STEPS.length} 步
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              已开始填写 {completedSteps}/5 项核心内容
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="实验填写进度"
            aria-valuemin={0}
            aria-valuemax={WORKFLOW_STEPS.length}
            aria-valuenow={activeStep + 1}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{
                width: `${((activeStep + 1) / WORKFLOW_STEPS.length) * 100}%`,
              }}
            />
          </div>
        </CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-3 xl:grid-cols-6">
          {WORKFLOW_STEPS.map((step, index) => (
            <Button
              key={step}
              type="button"
              variant={index === activeStep ? 'secondary' : 'ghost'}
              className="h-auto justify-start py-2 text-left whitespace-normal"
              aria-current={index === activeStep ? 'step' : undefined}
              onClick={() => void showStep(index)}
            >
              <span className="tabular-nums">{index + 1}.</span>
              {step}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div id={`experiment-step-${activeStep + 1}`} className="grid gap-6">
          {activeStep === 0 ? (
            <ModuleCard id="module-basic_info" title="基本信息">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>实验编号</Label>
                  <Input value={runCode ?? ''} readOnly />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-started-at">开始时间</Label>
                  <Input
                    id="experiment-started-at"
                    type="datetime-local"
                    required
                    value={toLocalDateTime(basicInfo.started_at)}
                    disabled={processReadOnly}
                    onChange={(event) => {
                      const started = event.target.value
                        ? new Date(event.target.value).toISOString()
                        : ''
                      setBasicInfo({
                        ...basicInfo,
                        started_at: started,
                        ambient_temperature:
                          basicInfo.ambient_temperature?.source_type ===
                          'manual_entry'
                            ? {
                                ...basicInfo.ambient_temperature,
                                measured_at: started,
                              }
                            : basicInfo.ambient_temperature,
                        ambient_humidity:
                          basicInfo.ambient_humidity?.source_type ===
                          'manual_entry'
                            ? {
                                ...basicInfo.ambient_humidity,
                                measured_at: started,
                              }
                            : basicInfo.ambient_humidity,
                      })
                      markDirty('basic_info')
                    }}
                  />
                </div>
                <fieldset className="grid gap-2 rounded-lg border p-3 sm:col-span-2">
                  <legend className="px-1 text-sm font-medium">实验人员</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(contributors.data ?? []).map((contributor) => {
                      const checked = basicInfo.performed_by_user_ids.includes(
                        contributor.id,
                      )
                      return (
                        <label
                          key={contributor.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          <Checkbox
                            disabled={processReadOnly}
                            checked={checked}
                            onCheckedChange={(value) => {
                              setBasicInfo({
                                ...basicInfo,
                                performed_by_user_ids:
                                  value === true
                                    ? [
                                        ...basicInfo.performed_by_user_ids,
                                        contributor.id,
                                      ]
                                    : basicInfo.performed_by_user_ids.filter(
                                        (id) => id !== contributor.id,
                                      ),
                              })
                              markDirty('basic_info')
                            }}
                          />
                          {contributor.name}（{contributor.email}）
                        </label>
                      )
                    })}
                  </div>
                </fieldset>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-room-temperature">
                    实验室温度（℃）
                  </Label>
                  <Input
                    id="experiment-room-temperature"
                    type="number"
                    step="any"
                    required
                    value={basicInfo.ambient_temperature?.value ?? ''}
                    disabled={processReadOnly}
                    onChange={(event) => {
                      const value = numberOrUndefined(event.target.value)
                      const started = basicInfo.started_at
                      setBasicInfo({
                        ...basicInfo,
                        ambient_temperature:
                          value === undefined
                            ? { source_type: 'not_measured' }
                            : {
                                value,
                                measured_at: started,
                                source_type: 'manual_entry',
                              },
                      })
                      markDirty('basic_info')
                    }}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="experiment-room-humidity">
                    实验室相对湿度（%RH）
                  </Label>
                  <Input
                    id="experiment-room-humidity"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    required
                    value={basicInfo.ambient_humidity?.value ?? ''}
                    disabled={processReadOnly}
                    onChange={(event) => {
                      const value = numberOrUndefined(event.target.value)
                      const started = basicInfo.started_at
                      setBasicInfo({
                        ...basicInfo,
                        ambient_humidity:
                          value === undefined
                            ? { source_type: 'not_measured' }
                            : {
                                value,
                                measured_at: started,
                                source_type: 'manual_entry',
                              },
                      })
                      markDirty('basic_info')
                    }}
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="experiment-note">补充说明</Label>
                  <Textarea
                    id="experiment-note"
                    value={basicInfo.note ?? ''}
                    disabled={processReadOnly}
                    onChange={(event) => {
                      setBasicInfo({
                        ...basicInfo,
                        note: event.target.value,
                      })
                      markDirty('basic_info')
                    }}
                  />
                </div>
                {[
                  basicInfo.ambient_temperature,
                  basicInfo.ambient_humidity,
                ].some(
                  (value) =>
                    value &&
                    value.source_type !== 'manual_entry' &&
                    value.source_type !== 'not_measured',
                ) ? (
                  <details className="sm:col-span-2">
                    <summary className="cursor-pointer text-sm font-medium">
                      历史环境记录
                    </summary>
                    <p className="mt-2 text-sm text-muted-foreground">
                      此记录曾使用传感器或估计来源；上方数值保存后将改为手工录入。
                    </p>
                  </details>
                ) : null}
              </div>
            </ModuleCard>
          ) : null}

          {activeStep === 1 ? (
            <SimpleTargetEditor
              target={target as SimpleTarget}
              selected={targetSelected}
              disabled={processReadOnly}
              onChange={(value) => {
                setTargetSelected(true)
                setTarget({ ...target, ...value })
                markDirty('target_product')
              }}
            />
          ) : null}

          {activeStep === 2 ? (
            <>
              <ModuleCard id="module-equipment" title="实验装置">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 sm:col-span-2">
                    <Label>实验装置</Label>
                    <EntityReferenceSelect
                      kind="setup"
                      productLabel
                      value={equipment.setupId}
                      selectedVersion={equipment.version}
                      selectedSnapshot={equipment.snapshot}
                      disabled={processReadOnly}
                      onChange={(id, entity) => {
                        setEquipment({
                          ...equipment,
                          setupId: id,
                          version: entity?.latest_version?.version ?? null,
                          snapshot: entity?.latest_version?.data ?? null,
                        })
                        markDirty('equipment')
                      }}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tube-reset-count">
                      最近一次清洗或更换后已使用
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="tube-reset-count"
                        type="number"
                        min="0"
                        value={tubeResetCount}
                        disabled={processReadOnly}
                        onChange={(event) => {
                          setEquipment({
                            ...equipment,
                            tubeUsageHistory: `${event.target.value},${tubeUseNumber}`,
                          })
                          markDirty('equipment')
                        }}
                      />
                      <span className="text-sm">炉</span>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="tube-use-number">
                      本次为清洗或更换后的
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">第</span>
                      <Input
                        id="tube-use-number"
                        type="number"
                        min="1"
                        value={tubeUseNumber}
                        disabled={processReadOnly}
                        onChange={(event) => {
                          setEquipment({
                            ...equipment,
                            tubeUsageHistory: `${tubeResetCount},${event.target.value}`,
                          })
                          markDirty('equipment')
                        }}
                      />
                      <span className="text-sm">炉</span>
                    </div>
                  </div>
                </div>
              </ModuleCard>
              <SimpleSourceLoadsEditor
                loads={loads}
                zoneCount={setupZoneCount}
                disabled={processReadOnly}
                onChange={(value) => {
                  setLoads(value)
                  markDirty('precursors')
                }}
              />
            </>
          ) : null}

          {activeStep === 3 ? (
            <SimpleSubstratesEditor
              substrates={substrates}
              disabled={processReadOnly}
              onChange={(value) => {
                setSubstrates(value)
                markDirty('substrates')
              }}
            />
          ) : null}

          {activeStep === 4 ? (
            <SimpleGrowthEditor
              segments={segments}
              channels={channels}
              settings={processSettings}
              events={events}
              runId={runId ?? ''}
              token={token}
              setupId={equipment.setupId}
              setupSnapshot={equipment.snapshot}
              zoneCount={setupZoneCount}
              disabled={processReadOnly}
              onTimelineChange={(nextSegments, nextChannels) => {
                setSegments(nextSegments)
                setChannels(nextChannels)
                markDirty('process_steps')
              }}
              onSettingsChange={(value) => {
                setProcessSettings(value)
                markDirty('process_steps')
              }}
              onEventsChange={(value) => {
                setEvents(value)
                markDirty('process_events')
              }}
            />
          ) : null}

          {activeStep === 5 ? (
            <ModuleCard title="检查并提交">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  [
                    '基本信息',
                    basicComplete
                      ? `${basicInfo.performed_by_user_ids.length} 名实验人员 · ${basicInfo.ambient_temperature?.value} ℃ · ${basicInfo.ambient_humidity?.value} %RH`
                      : '待填写',
                  ],
                  ['目标材料', targetComplete ? targetDisplay : '待填写'],
                  ['实验装置', setupName || '待选择'],
                  [
                    '前驱体',
                    loads.length ? `${loads.length} 个容器` : '待填写',
                  ],
                  [
                    '衬底',
                    substrates.length ? `${substrates.length} 片` : '待填写',
                  ],
                  [
                    '温度程序',
                    channels.filter(
                      (channel) => channel.channel_type === 'temperature',
                    ).length
                      ? `${
                          channels.filter(
                            (channel) => channel.channel_type === 'temperature',
                          ).length
                        } 个温区`
                      : '待填写',
                  ],
                  [
                    '气体程序',
                    channels.filter(
                      (channel) => channel.channel_type === 'flow',
                    ).length
                      ? `${
                          channels.filter(
                            (channel) => channel.channel_type === 'flow',
                          ).length
                        } 种气体`
                      : '未使用气体',
                  ],
                  [
                    '压力',
                    PRESSURE_REGIME_LABELS[
                      processSettings.pressure_regime ?? ''
                    ] ?? '待填写',
                  ],
                  ['异常情况', events.length ? '有异常记录' : '无异常'],
                ].map(([label, value]) => (
                  <div key={label} className="grid gap-1 rounded-lg border p-3">
                    <span className="text-xs text-muted-foreground">
                      {label}
                    </span>
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
              {[
                basicComplete,
                targetComplete,
                preparationComplete,
                substratesComplete,
                processTimelineIssue === null,
              ].some((complete) => !complete) ? (
                <Alert variant="destructive">
                  <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                    <span>还有必填内容未完成，请返回对应步骤修改。</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setActiveStep(
                          [
                            basicComplete,
                            targetComplete,
                            preparationComplete,
                            substratesComplete,
                            processTimelineIssue === null,
                          ].findIndex((complete) => !complete),
                        )
                      }
                    >
                      返回修改
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {runId && processReadOnly ? (
                <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">表征与结果</p>
                    <p className="text-sm text-muted-foreground">
                      实验记录已提交，可继续添加表征记录。
                    </p>
                  </div>
                  {canAddMeasurements ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        navigate({
                          to: '/characterizations',
                          search: { runId },
                        })
                      }
                    >
                      前往表征实验记录
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {processReadOnly ? (
                <Alert>
                  <Check />
                  <AlertTitle>当前制备实验已提交</AlertTitle>
                  <AlertDescription>
                    表征与结果仍可从统一入口继续记录。
                  </AlertDescription>
                </Alert>
              ) : (
                <Label className="flex items-start gap-3 rounded-lg border p-4">
                  <Checkbox
                    checked={precheckConfirmed}
                    onCheckedChange={(checked) => {
                      setBasicInfo({
                        ...basicInfo,
                        precheck: {
                          checklist_version: 'cvd-precheck-v1',
                          confirmed: checked === true,
                          confirmed_at: new Date().toISOString(),
                        },
                      })
                      markDirty('basic_info')
                    }}
                  />
                  <span>已完成实验前检查，确认以上内容与本炉实际情况一致</span>
                </Label>
              )}
            </ModuleCard>
          ) : null}

          {currentError ? (
            <Alert variant="destructive">
              <AlertDescription>{currentError}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        <Card size="sm" className="xl:sticky xl:top-20">
          <CardHeader className="border-b">
            <CardTitle>本炉摘要</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              ['实验编号', runCode || '未生成'],
              ['目标材料', targetDisplay || '未填写'],
              ['实验装置', setupName || '未选择'],
              ['衬底', `${substrates.length} 片`],
              [
                '生长条件',
                [
                  peakTemperature === null
                    ? ''
                    : `最高 ${Number(peakTemperature.toFixed(2))} °C`,
                  hasTemperatureFile ? '含温度时间序列' : '',
                  totalDuration ? `${Math.round(totalDuration / 60)} min` : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || '未填写',
              ],
            ].map(([label, value]) => (
              <div key={label} className="grid gap-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card
        size="sm"
        className="sticky bottom-3 z-20 shadow-lg supports-[backdrop-filter]:bg-card/90 supports-[backdrop-filter]:backdrop-blur"
      >
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={activeStep === 0 || savingKey !== null}
            onClick={() => setActiveStep((current) => Math.max(0, current - 1))}
          >
            <ArrowLeft data-icon="inline-start" />
            上一步
          </Button>
          <div className="flex items-center gap-3">
            {currentStepSaved ? (
              <Badge variant="outline">
                <Check data-icon="inline-start" />
                已保存
              </Badge>
            ) : null}
            {activeStep < WORKFLOW_STEPS.length - 1 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    processReadOnly || !currentStepDirty || savingKey !== null
                  }
                  onClick={() => void saveCurrentStep()}
                >
                  {savingKey ? '保存中…' : '保存草稿'}
                </Button>
                <Button
                  type="button"
                  disabled={savingKey !== null}
                  onClick={() => void showNextStep()}
                >
                  下一步
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </>
            ) : !processReadOnly ? (
              <Button
                type="button"
                disabled={!precheckConfirmed || savingKey !== null}
                onClick={() => void submitExperiment()}
              >
                <Check data-icon="inline-start" />
                提交实验记录并生成样品
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function TargetEditor({
  target,
  onChange,
  disabled,
}: {
  target: TargetSpec
  onChange: (value: TargetSpec) => void
  disabled: boolean
}) {
  const setRegion = (index: number, patch: Partial<Region>) =>
    onChange({
      ...target,
      material_regions: target.material_regions.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    })
  const example = targetExample(target)
  return (
    <ModuleCard id="module-target_product" title="目标材料">
      <Alert>
        <AlertTitle>填写示例 · {example.title}</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <dl className="grid gap-2 sm:grid-cols-2">
            {example.rows.map(([label, value]) => (
              <div key={label} className="grid gap-0.5">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onChange(example.value)}
            >
              应用此示例
            </Button>
            <span className="text-xs text-muted-foreground">
              示例会填入可编辑字段，保存前请按本炉目标核对。
            </span>
          </div>
        </AlertDescription>
      </Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>材料结构</Label>
          <Select
            value={target.architecture_type}
            disabled={disabled}
            onValueChange={(value) =>
              onChange(
                targetForArchitecture(
                  target,
                  value as TargetSpec['architecture_type'],
                ),
              )
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="single_region">单一材料</SelectItem>
                <SelectItem value="vertical_stack">垂直异质结构</SelectItem>
                <SelectItem value="lateral_junction">横向异质结构</SelectItem>
                <SelectItem value="mixed_architecture">
                  混合结构（同时含垂直与横向）
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>材料形态</Label>
          <Select
            value={target.dimensional_form}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({
                ...target,
                dimensional_form: value as TargetSpec['dimensional_form'],
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="sheet">二维片层或薄膜</SelectItem>
                <SelectItem value="ribbon">纳米带</SelectItem>
                <SelectItem value="tube">纳米管</SelectItem>
                <SelectItem value="rod">纳米棒</SelectItem>
                <SelectItem value="particle">颗粒</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>目标覆盖状态</Label>
          <Select
            value={target.coverage_state}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({
                ...target,
                coverage_state: value as TargetSpec['coverage_state'],
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="未设定" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="isolated">孤立晶畴</SelectItem>
                <SelectItem value="discontinuous">不连续覆盖</SelectItem>
                <SelectItem value="percolated">相互连通</SelectItem>
                <SelectItem value="continuous">连续覆盖</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>目标取向</Label>
          <Select
            value={target.orientation ?? 'none'}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({
                ...target,
                orientation:
                  value === 'none'
                    ? undefined
                    : (value as TargetSpec['orientation']),
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="none">未设定</SelectItem>
                <SelectItem value="in_plane">平面内生长</SelectItem>
                <SelectItem value="vertical">垂直生长</SelectItem>
                <SelectItem value="mixed">混合取向</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label>结构关系说明（选填）</Label>
        <Textarea
          value={target.note ?? ''}
          disabled={disabled}
          placeholder="例如 MoS₂ 位于 WS₂ 上层，横向连接区域为 A–B"
          onChange={(event) =>
            onChange({ ...target, note: event.target.value })
          }
        />
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">
              {target.architecture_type === 'vertical_stack'
                ? '逐层填写'
                : target.architecture_type === 'lateral_junction'
                  ? '逐区域填写'
                  : '材料组成'}
            </p>
            <p className="text-xs text-muted-foreground">
              实际样品状态在表征记录中填写，这里只表达实验目标。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...target,
                material_regions: [
                  ...target.material_regions,
                  {
                    region_key: machineKey('region'),
                    formula: '',
                    spatial_role:
                      target.architecture_type === 'vertical_stack'
                        ? 'layer'
                        : target.architecture_type === 'lateral_junction'
                          ? 'lateral_region'
                          : 'mixed_region',
                  },
                ],
              })
            }
          >
            <Plus />
            {target.architecture_type === 'vertical_stack'
              ? '添加一层'
              : '添加区域'}
          </Button>
        </div>
        {target.material_regions.map((region, index) => (
          <div
            key={`${region.region_key}-${index}`}
            className="grid gap-4 rounded-lg border p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">
                {target.architecture_type === 'vertical_stack'
                  ? `第 ${index + 1} 层${index === 0 ? '（靠近衬底）' : ''}`
                  : target.architecture_type === 'lateral_junction'
                    ? `区域 ${region.lateral_region || String.fromCharCode(65 + index)}`
                    : `材料 ${index + 1}`}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled || target.material_regions.length === 1}
                onClick={() =>
                  onChange({
                    ...target,
                    material_regions: target.material_regions.filter(
                      (_, current) => current !== index,
                    ),
                  })
                }
              >
                <Trash2 /> 删除
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>化学式</Label>
                <Input
                  value={region.formula}
                  disabled={disabled}
                  onChange={(event) =>
                    setRegion(index, { formula: event.target.value })
                  }
                  placeholder="例如 MoS₂"
                />
              </div>
              {target.architecture_type === 'vertical_stack' ? (
                <div className="grid gap-2">
                  <Label>从衬底起的层序</Label>
                  <Input
                    type="number"
                    min="1"
                    value={region.layer_index ?? index + 1}
                    disabled={disabled}
                    onChange={(event) =>
                      setRegion(index, {
                        layer_index: numberOrUndefined(event.target.value),
                      })
                    }
                  />
                </div>
              ) : null}
              {target.architecture_type === 'lateral_junction' ? (
                <div className="grid gap-2">
                  <Label>区域名称</Label>
                  <Input
                    value={
                      region.lateral_region ?? String.fromCharCode(65 + index)
                    }
                    disabled={disabled}
                    onChange={(event) =>
                      setRegion(index, {
                        lateral_region: event.target.value,
                      })
                    }
                    placeholder="例如 A"
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label>目标层数</Label>
                <Input
                  type="number"
                  min="1"
                  value={region.target_layer_count ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    setRegion(index, {
                      target_layer_count: numberOrUndefined(event.target.value),
                    })
                  }
                  placeholder="例如 1"
                />
              </div>
              <div className="grid gap-2">
                <Label>目标体相或多型（选填）</Label>
                <Input
                  value={region.target_bulk_phase ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    setRegion(index, {
                      target_bulk_phase: event.target.value,
                    })
                  }
                  placeholder="例如 2H"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">掺杂、合金与表面修饰</p>
            <p className="text-xs text-muted-foreground">
              仅在适用时添加，主体材料仍在上方填写。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange({
                ...target,
                composition_relations: [
                  ...target.composition_relations,
                  {
                    relation_type: 'doped_by',
                    host_region_key:
                      target.material_regions[0]?.region_key ?? '',
                    species: '',
                    value_basis: 'unspecified',
                  },
                ],
              })
            }
          >
            <Plus /> 添加掺杂、合金或表面修饰设置
          </Button>
        </div>
        {target.composition_relations.map((relation, index) => (
          <div
            key={index}
            className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          >
            <p className="font-medium sm:col-span-2">
              掺杂、合金或表面修饰设置 {index + 1}
            </p>
            <div className="grid gap-2">
              <Label>关系类型</Label>
              <Select
                value={relation.relation_type}
                disabled={disabled}
                onValueChange={(value) =>
                  onChange({
                    ...target,
                    composition_relations: target.composition_relations.map(
                      (item, current) =>
                        current === index
                          ? {
                              ...item,
                              relation_type:
                                value as CompositionRelation['relation_type'],
                            }
                          : item,
                    ),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="doped_by">掺杂</SelectItem>
                    <SelectItem value="substitutional_alloy">
                      取代合金
                    </SelectItem>
                    <SelectItem value="intercalated_by">插层</SelectItem>
                    <SelectItem value="decorated_by">表面修饰</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>作用于</Label>
              <Select
                value={relation.host_region_key}
                disabled={disabled}
                onValueChange={(value) =>
                  onChange({
                    ...target,
                    composition_relations: target.composition_relations.map(
                      (item, current) =>
                        current === index
                          ? { ...item, host_region_key: value }
                          : item,
                    ),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {target.material_regions.map((region, regionIndex) => (
                      <SelectItem
                        key={region.region_key}
                        value={region.region_key}
                      >
                        材料 {regionIndex + 1}
                        {region.formula ? ` · ${region.formula}` : ''}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>添加或取代的物种</Label>
              <Input
                value={relation.species}
                disabled={disabled}
                placeholder="例如 Pt 或 W"
                onChange={(event) =>
                  onChange({
                    ...target,
                    composition_relations: target.composition_relations.map(
                      (item, current) =>
                        current === index
                          ? { ...item, species: event.target.value }
                          : item,
                    ),
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>标称值（选填）</Label>
              <Input
                type="number"
                value={relation.nominal_value ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...target,
                    composition_relations: target.composition_relations.map(
                      (item, current) =>
                        current === index
                          ? {
                              ...item,
                              nominal_value: numberOrUndefined(
                                event.target.value,
                              ),
                            }
                          : item,
                    ),
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>含量表示方式</Label>
              <Select
                value={relation.value_basis}
                disabled={disabled}
                onValueChange={(value) =>
                  onChange({
                    ...target,
                    composition_relations: target.composition_relations.map(
                      (item, current) =>
                        current === index
                          ? {
                              ...item,
                              value_basis:
                                value as CompositionRelation['value_basis'],
                            }
                          : item,
                    ),
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="unspecified">未给出数值</SelectItem>
                    <SelectItem value="at_percent">原子百分比</SelectItem>
                    <SelectItem value="mol_fraction">摩尔分数</SelectItem>
                    <SelectItem value="site_fraction">位点分数</SelectItem>
                    <SelectItem value="ratio">比值</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>位点或位置（选填）</Label>
              <Input
                value={relation.site_or_location ?? ''}
                disabled={disabled}
                placeholder="例如 Mo 位点或表面"
                onChange={(event) =>
                  onChange({
                    ...target,
                    composition_relations: target.composition_relations.map(
                      (item, current) =>
                        current === index
                          ? {
                              ...item,
                              site_or_location: event.target.value,
                            }
                          : item,
                    ),
                  })
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              className="sm:col-span-2 sm:justify-self-end"
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...target,
                  composition_relations: target.composition_relations.filter(
                    (_, current) => current !== index,
                  ),
                })
              }
            >
              <Trash2 /> 删除
            </Button>
          </div>
        ))}
      </div>
    </ModuleCard>
  )
}

export function SourceLoadsEditor({
  loads,
  zoneCount,
  onChange,
  disabled,
  token,
}: {
  loads: SourceLoad[]
  zoneCount: number | null
  onChange: (value: SourceLoad[]) => void
  disabled: boolean
  token: string
}) {
  const containers = useQuery({
    queryKey: ['container-instances'],
    queryFn: () => listContainerInstances(token),
    enabled: Boolean(token),
  })
  const patchLoad = (index: number, patch: Partial<SourceLoad>) =>
    onChange(
      loads.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    )
  return (
    <ModuleCard id="module-precursors" title="前驱体与装料">
      <p className="text-sm text-muted-foreground">
        同一舟中共同研磨或混合的物料放在一个装料内；同一批次放在两个舟中则建两个装料。
      </p>
      {loads.map((load, loadIndex) => (
        <div key={loadIndex} className="grid gap-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">装料 {loadIndex + 1}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() =>
                onChange(loads.filter((_, current) => current !== loadIndex))
              }
            >
              <Trash2 /> 删除装料
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>装载方式</Label>
              <Select
                value={load.loading_method}
                disabled={disabled}
                onValueChange={(value) =>
                  patchLoad(loadIndex, { loading_method: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[
                      'boat',
                      'crucible',
                      'substrate_surface',
                      'gas_line',
                      'bubbler',
                      'other',
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {LOADING_METHOD_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>对应加热温区（选填）</Label>
              <Select
                value={load.heating_zone_ref ?? 'none'}
                disabled={disabled || zoneCount === null}
                onValueChange={(value) =>
                  patchLoad(loadIndex, {
                    heating_zone_ref: value === 'none' ? undefined : value,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      zoneCount === null ? '请先选择实验装置' : '选择温区'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">未指定</SelectItem>
                    {Array.from(
                      { length: zoneCount ?? 0 },
                      (_, index) => index + 1,
                    ).map((index) => (
                      <SelectItem key={index} value={`zone_${index}`}>
                        温区 {index}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>本次使用的具体容器（选填）</Label>
              <Select
                value={load.container_instance_id ?? 'none'}
                disabled={disabled || containers.isLoading}
                onValueChange={(value) =>
                  patchLoad(loadIndex, {
                    container_instance_id: value === 'none' ? undefined : value,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="none">未登记具体容器</SelectItem>
                    {(containers.data ?? [])
                      .filter((container) =>
                        load.ingredients.some(
                          (item) =>
                            item.material_lot_id === container.material_lot_id,
                        ),
                      )
                      .map((container) => (
                        <SelectItem key={container.id} value={container.id}>
                          {container.container_code} ·{' '}
                          {CONTAINER_STATUS_LABELS[container.status] ??
                            container.status}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>初始轴向位置（mm）</Label>
              <Input
                type="number"
                value={load.initial_position?.axial_mm ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  patchLoad(loadIndex, {
                    initial_position:
                      event.target.value === ''
                        ? undefined
                        : {
                            axial_mm: Number(event.target.value),
                            reference: 'setup_origin',
                          },
                  })
                }
              />
            </div>
            <p className="text-sm text-muted-foreground sm:col-span-2">
              温区引用来自当前装置；轴向位置用于记录装料在炉管中的实际位置。
            </p>
          </div>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">
              更多装料参数
            </summary>
            <div className="mt-4 grid gap-2">
              <div className="flex items-center justify-between">
                <Label>实验过程中移动前驱体源</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    patchLoad(loadIndex, {
                      position_program: [
                        ...load.position_program,
                        {
                          t_s:
                            load.position_program.at(-1)?.t_s === undefined
                              ? 0
                              : load.position_program.at(-1)!.t_s + 60,
                          axial_mm:
                            load.position_program.at(-1)?.axial_mm ??
                            load.initial_position?.axial_mm ??
                            0,
                          reference: 'setup_origin',
                        },
                      ],
                    })
                  }
                >
                  <Plus /> 添加位置点
                </Button>
              </div>
              {load.position_program.map((point, pointIndex) => (
                <div
                  key={pointIndex}
                  className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                >
                  <div className="grid gap-2">
                    <Label>时间（s）</Label>
                    <Input
                      type="number"
                      value={point.t_s}
                      disabled={disabled}
                      onChange={(event) =>
                        patchLoad(loadIndex, {
                          position_program: load.position_program.map(
                            (item, current) =>
                              current === pointIndex
                                ? { ...item, t_s: Number(event.target.value) }
                                : item,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>轴向位置（mm）</Label>
                    <Input
                      type="number"
                      value={point.axial_mm}
                      disabled={disabled}
                      onChange={(event) =>
                        patchLoad(loadIndex, {
                          position_program: load.position_program.map(
                            (item, current) =>
                              current === pointIndex
                                ? {
                                    ...item,
                                    axial_mm: Number(event.target.value),
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="sm:col-span-2 sm:justify-self-end"
                    disabled={disabled}
                    onClick={() =>
                      patchLoad(loadIndex, {
                        position_program: load.position_program.filter(
                          (_, current) => current !== pointIndex,
                        ),
                      })
                    }
                  >
                    <Trash2 /> 删除位置点
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>共同制备步骤</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    patchLoad(loadIndex, {
                      preparation_steps: [
                        ...load.preparation_steps,
                        {
                          step_type: 'grind',
                          sequence: load.preparation_steps.length + 1,
                          parameters: {},
                        },
                      ],
                    })
                  }
                >
                  <Plus /> 添加步骤
                </Button>
              </div>
              {load.preparation_steps.map((step, stepIndex) => (
                <div key={stepIndex} className="flex gap-2">
                  <Select
                    value={step.step_type}
                    disabled={disabled}
                    onValueChange={(value) =>
                      patchLoad(loadIndex, {
                        preparation_steps: load.preparation_steps.map(
                          (item, current) =>
                            current === stepIndex
                              ? { ...item, step_type: value }
                              : item,
                        ),
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PREPARATION_STEP_LABELS).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      patchLoad(loadIndex, {
                        preparation_steps: load.preparation_steps
                          .filter((_, current) => current !== stepIndex)
                          .map((item, current) => ({
                            ...item,
                            sequence: current + 1,
                          })),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          </details>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>装料成分</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  patchLoad(loadIndex, {
                    ingredients: [
                      ...load.ingredients,
                      {
                        material_lot_id: '',
                        material_lot_version: 1,
                        function_role: 'metal_source',
                      },
                    ],
                  })
                }
              >
                <Plus /> 添加成分
              </Button>
            </div>
            {load.ingredients.map((ingredient, ingredientIndex) => (
              <div
                key={ingredientIndex}
                className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2"
              >
                <div className="grid gap-2 sm:col-span-2">
                  <Label>物料批次</Label>
                  <EntityReferenceSelect
                    kind="material_lot"
                    value={ingredient.material_lot_id}
                    selectedVersion={ingredient.material_lot_version}
                    selectedSnapshot={ingredient.snapshot}
                    disabled={disabled}
                    filter={(entity) =>
                      ['chemical', 'gas_cylinder'].includes(
                        String(entity.latest_version?.data['lot_category']),
                      )
                    }
                    onChange={(id, entity: V2EntityRead | null) =>
                      patchLoad(loadIndex, {
                        ingredients: load.ingredients.map((item, current) =>
                          current === ingredientIndex
                            ? {
                                ...item,
                                material_lot_id: id,
                                material_lot_version:
                                  entity?.latest_version?.version ?? 1,
                                snapshot:
                                  entity?.latest_version?.data ?? undefined,
                              }
                            : item,
                        ),
                      })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label>在本次实验中的作用</Label>
                  <Select
                    value={ingredient.function_role}
                    disabled={disabled}
                    onValueChange={(value) =>
                      patchLoad(loadIndex, {
                        ingredients: load.ingredients.map((item, current) =>
                          current === ingredientIndex
                            ? { ...item, function_role: value }
                            : item,
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {[
                          'metal_source',
                          'chalcogen_source',
                          'carbon_source',
                          'dopant_source',
                          'promoter',
                          'transport_agent',
                          'etchant',
                          'reducing_agent',
                          'oxidizing_agent',
                          'carrier_gas',
                          'other',
                        ].map((value) => (
                          <SelectItem key={value} value={value}>
                            {INGREDIENT_ROLE_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-[1fr_8rem] gap-3">
                  <div className="grid gap-2">
                    <Label>用量（选填）</Label>
                    <Input
                      type="number"
                      value={ingredient.amount ?? ''}
                      disabled={disabled}
                      onChange={(event) =>
                        patchLoad(loadIndex, {
                          ingredients: load.ingredients.map((item, current) =>
                            current === ingredientIndex
                              ? {
                                  ...item,
                                  amount: numberOrUndefined(event.target.value),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>单位</Label>
                    <Input
                      value={ingredient.unit ?? ''}
                      disabled={disabled}
                      placeholder="mg"
                      onChange={(event) =>
                        patchLoad(loadIndex, {
                          ingredients: load.ingredients.map((item, current) =>
                            current === ingredientIndex
                              ? { ...item, unit: event.target.value }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="sm:col-span-2 sm:justify-self-end"
                  disabled={disabled || load.ingredients.length === 1}
                  onClick={() =>
                    patchLoad(loadIndex, {
                      ingredients: load.ingredients.filter(
                        (_, current) => current !== ingredientIndex,
                      ),
                    })
                  }
                >
                  <Trash2 /> 删除
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...loads,
            {
              load_key: machineKey('source'),
              loading_method: 'boat',
              preparation_steps: [],
              position_program: [],
              ingredients: [
                {
                  material_lot_id: '',
                  material_lot_version: 1,
                  function_role: 'metal_source',
                },
              ],
            },
          ])
        }
      >
        <Plus /> 添加一组装料
      </Button>
    </ModuleCard>
  )
}

export function TimelineEditor({
  runId,
  token,
  segments,
  channels,
  zoneCount,
  onChange,
  disabled,
}: {
  runId: string
  token: string
  segments: Segment[]
  channels: Channel[]
  zoneCount: number | null
  onChange: (segments: Segment[], channels: Channel[]) => void
  disabled: boolean
}) {
  const patchSegment = (index: number, patch: Partial<Segment>) =>
    onChange(
      segments.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
      channels,
    )
  const patchChannel = (index: number, patch: Partial<Channel>) =>
    onChange(
      segments,
      channels.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    )
  const addChannel = (channelType: string) => {
    const stateChannel = channelType.endsWith('_state')
    const deviceChannel = !['temperature', 'flow', 'pressure'].includes(
      channelType,
    )
    const channel: Channel = {
      channel_key: machineKey('channel'),
      channel_type: channelType,
      source_type: '',
      subject_type: deviceChannel
        ? 'device'
        : channelType === 'temperature'
          ? 'temperature_zone'
          : channelType === 'flow'
            ? 'gas_species'
            : 'pressure_location',
      subject_ref: deviceChannel ? channelType : '',
      subject_instance_ref: '',
      unit: PROCESS_UNITS[channelType][0],
      data_kind: stateChannel ? 'interval_series' : 'scalar',
      ...(stateChannel
        ? { series: [{ start_s: 0, end_s: 60, value: '' }] }
        : {}),
    }
    onChange(segments, [...channels, channel])
  }
  const setChannelSubject = (
    index: number,
    subject: 'zone' | 'gas_species' | 'pressure_location',
    value: string,
  ) => {
    const channel = channels[index]
    const patch =
      subject === 'zone'
        ? {
            subject_type: 'temperature_zone',
            subject_ref: value,
            zone_index: Number(value.replace('zone_', '')) || undefined,
          }
        : subject === 'gas_species'
          ? {
              subject_type: 'gas_species',
              subject_ref: value,
              gas_species_code: value,
            }
          : {
              subject_type: 'pressure_location',
              subject_ref: value.trim(),
              pressure_location: value,
            }
    patchChannel(index, withProcessChannelSubject(channel, patch))
  }
  const uploadSeries = async (index: number, file: File) => {
    const channel = channels[index]
    try {
      const uploaded = await uploadExperimentFile(token, runId, {
        file,
        assetRole: 'process_timeseries',
        bindingType: 'process_channel',
        bindingId: channel.channel_key,
      })
      patchChannel(index, {
        data_kind: 'timeseries_file',
        file_asset_id: uploaded.id,
        scalar_value: undefined,
        series: undefined,
      })
      toast.success('时间序列文件已上传')
    } catch (error) {
      toast.error(resolveErrorMessage(error, '时间序列上传失败'))
    }
  }
  return (
    <ModuleCard id="module-process_steps" title="生长程序">
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">实验阶段</p>
            <p className="text-xs text-muted-foreground">
              按实际先后填写吹扫、升温、生长、冷却等阶段。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange(
                [
                  ...segments,
                  {
                    segment_key: machineKey('segment'),
                    segment_type: segments.length === 0 ? 'growth' : 'other',
                    sequence: segments.length + 1,
                    start_s: segments.at(-1)?.end_s ?? 0,
                    end_s: (segments.at(-1)?.end_s ?? 0) + 60,
                  },
                ],
                channels,
              )
            }
          >
            <Plus /> 添加阶段
          </Button>
        </div>
        {segments.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            尚未填写实验阶段。
          </p>
        ) : null}
        {segments.map((segment, index) => (
          <div key={index} className="grid gap-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">阶段 {index + 1}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    segments
                      .filter((_, current) => current !== index)
                      .map((item, current) => ({
                        ...item,
                        sequence: current + 1,
                      })),
                    channels,
                  )
                }
              >
                <Trash2 /> 删除
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>阶段类型</Label>
                <Select
                  value={segment.segment_type}
                  disabled={disabled}
                  onValueChange={(value) =>
                    patchSegment(index, { segment_type: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[
                        'purge',
                        'ramp',
                        'nucleation',
                        'growth',
                        'anneal',
                        'cooling',
                        'transfer',
                        'other',
                      ].map((value) => (
                        <SelectItem key={value} value={value}>
                          {SEGMENT_LABELS[value]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>阶段名称（选填）</Label>
                <Input
                  value={segment.label ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    patchSegment(index, { label: event.target.value })
                  }
                  placeholder="例如快速升温"
                />
              </div>
              <div className="grid gap-2">
                <Label>开始时间（min）</Label>
                <Input
                  type="number"
                  value={segment.start_s / 60}
                  disabled={disabled}
                  onChange={(event) =>
                    patchSegment(index, {
                      start_s: Number(event.target.value) * 60,
                    })
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>结束时间（min）</Label>
                <Input
                  type="number"
                  value={segment.end_s / 60}
                  disabled={disabled}
                  onChange={(event) =>
                    patchSegment(index, {
                      end_s: Number(event.target.value) * 60,
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <div className="grid gap-3">
          <div>
            <p className="font-medium">温度、气体与压力条件</p>
            <p className="text-xs text-muted-foreground">
              按实际记录添加对应条件；新记录不会自动带入任何实验数值。
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['temperature', '添加温度条件'],
              ['flow', '添加气体流量'],
              ['pressure', '添加压力条件'],
              ['plasma_power', '添加外场或设备状态'],
            ].map(([type, label]) => (
              <Button
                key={type}
                type="button"
                size="sm"
                variant="outline"
                className="justify-start"
                disabled={disabled}
                onClick={() => addChannel(type)}
              >
                <Plus data-icon="inline-start" />
                {label}
              </Button>
            ))}
          </div>
        </div>
        {channels.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            尚未填写温度、气体、压力或设备条件。
          </p>
        ) : null}
        {channels.map((channel, index) => (
          <div
            key={channel.channel_key}
            className="grid gap-4 rounded-lg border p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{processChannelTitle(channel)}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChange(
                    segments,
                    channels.filter((_, current) => current !== index),
                  )
                }
              >
                <Trash2 /> 删除
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {channel.channel_type === 'temperature' ? (
                <div className="grid gap-2">
                  <Label>对应温区</Label>
                  {zoneCount ? (
                    <Select
                      value={String(
                        channel.zone_index ? `zone_${channel.zone_index}` : '',
                      )}
                      disabled={disabled}
                      onValueChange={(value) =>
                        setChannelSubject(index, 'zone', value)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择温区" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Array.from({ length: zoneCount }, (_, zoneIndex) => (
                            <SelectItem
                              key={zoneIndex}
                              value={`zone_${zoneIndex + 1}`}
                            >
                              温区 {zoneIndex + 1}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={String(channel.zone_index ?? '')}
                      disabled={disabled}
                      type="number"
                      min="1"
                      placeholder="例如 1"
                      onChange={(event) =>
                        setChannelSubject(
                          index,
                          'zone',
                          event.target.value
                            ? `zone_${event.target.value}`
                            : '',
                        )
                      }
                    />
                  )}
                </div>
              ) : channel.channel_type === 'flow' ? (
                <>
                  <div className="grid gap-2">
                    <Label>气体种类</Label>
                    <Select
                      value={String(channel.gas_species_code ?? '')}
                      disabled={disabled}
                      onValueChange={(value) =>
                        setChannelSubject(index, 'gas_species', value)
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择气体" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Object.entries(gasSpecies).map(([code, item]) => (
                            <SelectItem key={code} value={code}>
                              {item.label_zh}（{code}）
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>气瓶批次（物料批次库，选填）</Label>
                    <EntityReferenceSelect
                      kind="material_lot"
                      value={channel.gas_lot_id ?? ''}
                      selectedVersion={channel.gas_lot_version}
                      selectedSnapshot={null}
                      disabled={disabled}
                      filter={(entity) =>
                        entity.latest_version?.data['lot_category'] ===
                        'gas_cylinder'
                      }
                      allowedLotCategories={['gas_cylinder']}
                      onChange={(gas_lot_id, entity) =>
                        patchChannel(index, {
                          gas_lot_id,
                          gas_lot_version:
                            entity?.latest_version?.version ?? undefined,
                        })
                      }
                    />
                  </div>
                </>
              ) : channel.channel_type === 'pressure' ? (
                <>
                  <div className="grid gap-2">
                    <Label>压力位置</Label>
                    <Input
                      value={String(channel.pressure_location ?? '')}
                      disabled={disabled}
                      placeholder="例如 反应腔"
                      onChange={(event) =>
                        setChannelSubject(
                          index,
                          'pressure_location',
                          event.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>压力类型</Label>
                    <Select
                      value={String(channel.pressure_type ?? '')}
                      disabled={disabled}
                      onValueChange={(value) =>
                        patchChannel(index, { pressure_type: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="选择压力类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="absolute">绝对压力</SelectItem>
                          <SelectItem value="gauge">表压</SelectItem>
                          <SelectItem value="differential">压差</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="grid gap-2">
                  <Label>记录对象</Label>
                  <Select
                    value={channel.channel_type}
                    disabled={disabled}
                    onValueChange={(value) => {
                      const stateChannel = value.endsWith('_state')
                      patchChannel(index, {
                        channel_type: value,
                        subject_type: 'device',
                        subject_ref: value,
                        unit: PROCESS_UNITS[value][0],
                        data_kind: stateChannel ? 'interval_series' : 'scalar',
                        scalar_value: undefined,
                        series: stateChannel
                          ? [{ start_s: 0, end_s: 60, value: '' }]
                          : undefined,
                        file_asset_id: undefined,
                      })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {[
                          'plasma_power',
                          'valve_state',
                          'source_position',
                          'furnace_position',
                          'shutter_state',
                        ].map((value) => (
                          <SelectItem key={value} value={value}>
                            {CHANNEL_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>物理通道实例</Label>
                <Input
                  value={channel.subject_instance_ref}
                  disabled={disabled}
                  placeholder={
                    channel.channel_type === 'flow'
                      ? '例如 MFC-Ar-1'
                      : channel.channel_type === 'temperature'
                        ? '例如 TC-zone1-A'
                        : channel.channel_type === 'pressure'
                          ? '例如 PG-outlet-1'
                          : '例如 valve-1'
                  }
                  onChange={(event) =>
                    patchChannel(index, {
                      subject_instance_ref: event.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  填写装置中可稳定识别的传感器、MFC、阀门或执行器编号。
                </p>
              </div>
              <div className="grid gap-2">
                <Label>记录的是</Label>
                <Select
                  value={channel.source_type}
                  disabled={disabled}
                  onValueChange={(value) =>
                    patchChannel(index, { source_type: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="选择数据来源" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="setpoint">设定值</SelectItem>
                      <SelectItem value="measured">实测值</SelectItem>
                      <SelectItem value="inferred">推断值</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>单位</Label>
                <Select
                  value={channel.unit}
                  disabled={disabled}
                  onValueChange={(unit) => patchChannel(index, { unit })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(PROCESS_UNITS[channel.channel_type] ?? []).map(
                        (unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ),
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>记录方式</Label>
                <Select
                  value={channel.data_kind}
                  disabled={disabled}
                  onValueChange={(value) =>
                    patchChannel(index, {
                      data_kind: value as Channel['data_kind'],
                      scalar_value: undefined,
                      series:
                        value === 'interval_series'
                          ? [{ start_s: 0, end_s: 60, value: '' }]
                          : undefined,
                      file_asset_id: undefined,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {!channel.channel_type.endsWith('_state') ? (
                        <SelectItem value="scalar">单次值</SelectItem>
                      ) : null}
                      <SelectItem value="interval_series">分时段</SelectItem>
                      {!channel.channel_type.endsWith('_state') ? (
                        <SelectItem value="timeseries_file">
                          上传时间序列
                        </SelectItem>
                      ) : null}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label>
                  {channel.channel_type === 'temperature'
                    ? '温度'
                    : channel.channel_type === 'flow'
                      ? '流量'
                      : channel.channel_type === 'pressure'
                        ? '压力'
                        : '记录值'}
                </Label>
                {channel.data_kind === 'scalar' ? (
                  <Input
                    type={
                      channel.channel_type.endsWith('_state')
                        ? 'text'
                        : 'number'
                    }
                    value={channel.scalar_value ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      patchChannel(index, {
                        scalar_value: numberOrUndefined(event.target.value),
                      })
                    }
                  />
                ) : channel.data_kind === 'interval_series' ? (
                  <div className="grid gap-1">
                    {(channel.series ?? []).map((point, pointIndex) => (
                      <div
                        key={pointIndex}
                        className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                      >
                        {(
                          [
                            ['start_s', '开始时间（min）'],
                            ['end_s', '结束时间（min）'],
                            [
                              'value',
                              channel.channel_type === 'temperature'
                                ? '温度'
                                : channel.channel_type === 'flow'
                                  ? '流量'
                                  : channel.channel_type === 'pressure'
                                    ? '压力'
                                    : '状态或数值',
                            ],
                          ] as const
                        ).map(([key, label]) => (
                          <div key={key} className="grid gap-2">
                            <Label>{label}</Label>
                            <Input
                              type={
                                key === 'value' &&
                                channel.channel_type.endsWith('_state')
                                  ? 'text'
                                  : 'number'
                              }
                              value={
                                key === 'value'
                                  ? point.value
                                  : point[key] === undefined
                                    ? ''
                                    : Number(point[key]) / 60
                              }
                              disabled={disabled}
                              onChange={(event) =>
                                patchChannel(index, {
                                  series: (channel.series ?? []).map(
                                    (item, current) =>
                                      current === pointIndex
                                        ? {
                                            ...item,
                                            [key]:
                                              key === 'value'
                                                ? channel.channel_type.endsWith(
                                                    '_state',
                                                  )
                                                  ? event.target.value
                                                  : event.target.value === ''
                                                    ? ''
                                                    : Number(event.target.value)
                                                : event.target.value === ''
                                                  ? undefined
                                                  : Number(event.target.value) *
                                                    60,
                                          }
                                        : item,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="sm:col-span-2 sm:justify-self-end"
                          disabled={disabled}
                          onClick={() =>
                            patchChannel(index, {
                              series: channel.series?.filter(
                                (_, current) => current !== pointIndex,
                              ),
                            })
                          }
                        >
                          <Trash2 /> 删除区间
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={disabled}
                      onClick={() =>
                        patchChannel(index, {
                          series: [
                            ...(channel.series ?? []),
                            {
                              start_s: channel.series?.at(-1)?.end_s ?? 0,
                              end_s: (channel.series?.at(-1)?.end_s ?? 0) + 60,
                              value: '',
                            },
                          ],
                        })
                      }
                    >
                      <Plus /> 添加区间
                    </Button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
                    <Upload className="size-4" />
                    {channel.file_asset_id ? '已上传' : '上传 CSV'}
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      disabled={disabled}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) void uploadSeries(index, file)
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      表头须含 time_s,value
                    </span>
                  </label>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ModuleCard>
  )
}

function ControlledChecklist({
  label,
  values,
  options,
  disabled,
  required = false,
  onChange,
}: {
  label: string
  values: string[]
  options: ReadonlyArray<readonly [string, string]>
  disabled: boolean
  required?: boolean
  onChange: (values: string[]) => void
}) {
  return (
    <fieldset className="grid gap-2 rounded-md border p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map(([value, optionLabel]) => {
          const checked = values.includes(value)
          return (
            <label key={value} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={checked}
                disabled={
                  disabled || (required && checked && values.length === 1)
                }
                onCheckedChange={(nextChecked) =>
                  onChange(
                    nextChecked === true
                      ? [...values, value]
                      : values.filter((item) => item !== value),
                  )
                }
              />
              {optionLabel}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function EventsEditor({
  events,
  onChange,
  disabled,
}: {
  events: ProcessEvent[]
  onChange: (events: ProcessEvent[]) => void
  disabled: boolean
}) {
  const patch = (index: number, patchValue: Partial<ProcessEvent>) =>
    onChange(
      events.map((item, current) =>
        current === index ? { ...item, ...patchValue } : item,
      ),
    )
  return (
    <ModuleCard id="module-process_events" title="异常情况">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          如实验过程正常，可不添加；发生异常、人工干预或数据失效时再记录。
        </p>
      ) : null}
      {events.map((event, index) => (
        <div
          key={index}
          className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
        >
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <p className="font-medium">异常 {index + 1}</p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() =>
                onChange(events.filter((_, current) => current !== index))
              }
            >
              <Trash2 /> 删除
            </Button>
          </div>
          <div className="grid gap-2">
            <Label>开始时间（s）</Label>
            <Input
              type="number"
              value={event.start_s}
              disabled={disabled}
              onChange={(input) =>
                patch(index, { start_s: Number(input.target.value) })
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>结束时间（s，选填）</Label>
            <Input
              type="number"
              value={event.end_s ?? ''}
              disabled={disabled}
              onChange={(input) =>
                patch(index, { end_s: numberOrUndefined(input.target.value) })
              }
            />
          </div>
          <ControlledChecklist
            label="观察到的偏差"
            values={event.observed_deviations}
            options={EVENT_OPTIONS.observed_deviations}
            disabled={disabled}
            required
            onChange={(values) => patch(index, { observed_deviations: values })}
          />
          <div className="grid gap-2">
            <Label>对数据有效性的影响</Label>
            <Select
              value={event.data_validity_impact ?? 'unknown'}
              disabled={disabled}
              onValueChange={(value) =>
                patch(index, { data_validity_impact: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">不影响</SelectItem>
                  <SelectItem value="partial">部分影响</SelectItem>
                  <SelectItem value="invalid">数据无效</SelectItem>
                  <SelectItem value="unknown">未知</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label>客观描述</Label>
            <Textarea
              value={event.description ?? ''}
              disabled={disabled}
              onChange={(input) =>
                patch(index, { description: input.target.value })
              }
              placeholder="描述观察到的现象和发生经过"
            />
          </div>
          {(
            [
              ['intervention_actions', '干预动作'],
              ['affected_objects', '受影响对象'],
              ['suspected_causes', '怀疑原因'],
            ] as const
          ).map(([key, label]) => (
            <ControlledChecklist
              key={key}
              label={label}
              values={event[key]}
              options={EVENT_OPTIONS[key]}
              disabled={disabled}
              onChange={(values) => patch(index, { [key]: values })}
            />
          ))}
          <div className="grid gap-2">
            <Label>处理结果</Label>
            <Select
              value={event.outcome ?? 'unknown'}
              disabled={disabled}
              onValueChange={(outcome) => patch(index, { outcome })}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="recovered">已恢复</SelectItem>
                  <SelectItem value="partially_recovered">部分恢复</SelectItem>
                  <SelectItem value="terminated">实验终止</SelectItem>
                  <SelectItem value="unknown">结果未知</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>排除的数据时间范围</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  patch(index, {
                    excluded_time_ranges: [
                      ...event.excluded_time_ranges,
                      {
                        start_s: event.start_s,
                        end_s: event.end_s ?? event.start_s + 1,
                      },
                    ],
                  })
                }
              >
                <Plus /> 添加范围
              </Button>
            </div>
            {event.excluded_time_ranges.map((range, rangeIndex) => (
              <div
                key={rangeIndex}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
              >
                {(['start_s', 'end_s'] as const).map((key) => (
                  <div key={key} className="grid gap-2">
                    <Label>
                      {key === 'start_s'
                        ? '排除开始时间（s）'
                        : '排除结束时间（s）'}
                    </Label>
                    <Input
                      type="number"
                      value={range[key]}
                      disabled={disabled}
                      onChange={(input) =>
                        patch(index, {
                          excluded_time_ranges: event.excluded_time_ranges.map(
                            (item, current) =>
                              current === rangeIndex
                                ? {
                                    ...item,
                                    [key]: Number(input.target.value),
                                  }
                                : item,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="sm:col-span-2 sm:justify-self-end"
                  disabled={disabled}
                  onClick={() =>
                    patch(index, {
                      excluded_time_ranges: event.excluded_time_ranges.filter(
                        (_, current) => current !== rangeIndex,
                      ),
                    })
                  }
                >
                  <Trash2 /> 删除范围
                </Button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...events,
            {
              event_key: machineKey('event'),
              start_s: 0,
              observed_deviations: ['gas_interruption'],
              intervention_actions: [],
              affected_objects: [],
              suspected_causes: [],
              excluded_time_ranges: [],
              attachment_file_ids: [],
            },
          ])
        }
      >
        <Plus /> 添加事件
      </Button>
    </ModuleCard>
  )
}

type MeasurementPropertyDraft = {
  id: string
  propertyCode: string
  value: string
  uncertainty: string
  uncertaintyType: string
  sampleCount: string
  quality: string
}

type MaterialAssertionDraft = {
  id: string
  type: string
  value: string
  basis: string
  components: Array<{ id: string; species: string; fraction: string }>
}

function newPropertyDraft(propertyCode = ''): MeasurementPropertyDraft {
  return {
    id: crypto.randomUUID(),
    propertyCode,
    value: '',
    uncertainty: '',
    uncertaintyType: '',
    sampleCount: '',
    quality: 'valid',
  }
}

function newAssertionDraft(type = 'phase_identity'): MaterialAssertionDraft {
  return {
    id: crypto.randomUUID(),
    type,
    value: '',
    basis: 'site_fraction',
    components: [{ id: crypto.randomUUID(), species: '', fraction: '' }],
  }
}

function propertyDraftValid(property: MeasurementPropertyDraft): boolean {
  if (!property.value.trim()) return true
  return (
    Boolean(property.propertyCode) &&
    Number.isFinite(Number(property.value)) &&
    (property.uncertainty === '' ||
      (Number(property.uncertainty) >= 0 &&
        Boolean(property.uncertaintyType))) &&
    (property.sampleCount === '' ||
      (Number.isInteger(Number(property.sampleCount)) &&
        Number(property.sampleCount) >= 1))
  )
}

function assertionDraftValid(assertion: MaterialAssertionDraft): boolean {
  if (assertion.type === 'composition') {
    return (
      assertion.components.every(
        (component) =>
          Boolean(component.species.trim()) &&
          component.fraction !== '' &&
          Number(component.fraction) >= 0 &&
          Number(component.fraction) <= 1,
      ) &&
      Math.abs(
        assertion.components.reduce(
          (total, component) => total + Number(component.fraction),
          0,
        ) - 1,
      ) <= 1e-6
    )
  }
  if (assertion.type === 'layer_count') {
    return (
      Number.isInteger(Number(assertion.value)) && Number(assertion.value) >= 1
    )
  }
  return Boolean(assertion.value.trim())
}

function regionDraftValid(region: {
  geometryType: string
  label: string
  x: string
  y: string
  width: string
  height: string
  unit: string
}): boolean {
  if (!region.geometryType || !region.label.trim()) return false
  if (Boolean(region.x) !== Boolean(region.y)) return false
  if (
    region.geometryType === 'line' &&
    (!region.width || Number(region.width) <= 0)
  )
    return false
  if (
    region.geometryType === 'area' &&
    (!region.width ||
      !region.height ||
      Number(region.width) <= 0 ||
      Number(region.height) <= 0)
  )
    return false
  return (
    ![region.x, region.y, region.width, region.height].some(
      (value) => value && !Number.isFinite(Number(value)),
    ) &&
    (![region.x, region.y, region.width, region.height].some(Boolean) ||
      Boolean(region.unit.trim()))
  )
}

function MeasurementPropertyEditor({
  property,
  propertyCodes,
  onChange,
  onRemove,
}: {
  property: MeasurementPropertyDraft
  propertyCodes: string[]
  onChange: (patch: Partial<MeasurementPropertyDraft>) => void
  onRemove: () => void
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
        <CardTitle>测量结果</CardTitle>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 data-icon="inline-start" /> 删除
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>结果类型</Label>
          <Select
            value={property.propertyCode}
            onValueChange={(propertyCode) => onChange({ propertyCode })}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择结果类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {propertyCodes.map((code) => (
                  <SelectItem key={code} value={code}>
                    {PROPERTY_LABELS[code]}（{PROPERTY_UNITS[code]}）
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>
            结果值
            {property.propertyCode
              ? `（${PROPERTY_UNITS[property.propertyCode]}）`
              : ''}
          </Label>
          <Input
            type="number"
            value={property.value}
            disabled={!property.propertyCode}
            placeholder="不填写则不提交此项"
            onChange={(event) => onChange({ value: event.target.value })}
          />
        </div>
        <details className="rounded-lg border p-3 sm:col-span-2">
          <summary className="cursor-pointer font-medium">
            统计与质量信息
          </summary>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>测量不确定度</Label>
              <Input
                type="number"
                min="0"
                value={property.uncertainty}
                disabled={!property.value}
                onChange={(event) =>
                  onChange({ uncertainty: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>不确定度类型</Label>
              <Select
                value={property.uncertaintyType}
                disabled={!property.uncertainty}
                onValueChange={(uncertaintyType) =>
                  onChange({ uncertaintyType })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择统计口径" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="standard_deviation">标准差</SelectItem>
                    <SelectItem value="standard_error">标准误差</SelectItem>
                    <SelectItem value="confidence_interval">
                      置信区间
                    </SelectItem>
                    <SelectItem value="expanded_uncertainty">
                      扩展不确定度
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>样本数 n</Label>
              <Input
                type="number"
                min="1"
                value={property.sampleCount}
                disabled={!property.value}
                onChange={(event) =>
                  onChange({ sampleCount: event.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>数据质量</Label>
              <Select
                value={property.quality}
                disabled={!property.value}
                onValueChange={(quality) => onChange({ quality })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="valid">有效</SelectItem>
                    <SelectItem value="suspect">可疑</SelectItem>
                    <SelectItem value="invalid">无效</SelectItem>
                    <SelectItem value="below_detection_limit">
                      低于检出限
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

function MaterialAssertionEditor({
  assertion,
  assertionTypes,
  onChange,
  onRemove,
}: {
  assertion: MaterialAssertionDraft
  assertionTypes: string[]
  onChange: (patch: Partial<MaterialAssertionDraft>) => void
  onRemove: () => void
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
        <CardTitle>材料结论</CardTitle>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 data-icon="inline-start" /> 删除
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label>结论类型</Label>
          <Select
            value={assertion.type}
            onValueChange={(type) =>
              onChange({
                type,
                value: '',
                components:
                  type === 'composition'
                    ? [
                        {
                          id: crypto.randomUUID(),
                          species: '',
                          fraction: '',
                        },
                      ]
                    : assertion.components,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {assertionTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {
                      (
                        {
                          phase_identity: '物相身份',
                          composition: '组成',
                          polytype: '多型',
                          stacking_order: '堆叠顺序',
                          orientation_relationship: '取向关系',
                          layer_count: '层数结论',
                        } as Record<string, string>
                      )[type]
                    }
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {assertion.type === 'composition' ? (
          <>
            <div className="grid gap-2">
              <Label>组成基准</Label>
              <Select
                value={assertion.basis}
                onValueChange={(basis) => onChange({ basis })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="site_fraction">位点分数</SelectItem>
                    <SelectItem value="atomic_fraction">原子分数</SelectItem>
                    <SelectItem value="mass_fraction">质量分数</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:col-span-2">
              {assertion.components.map((component) => (
                <div
                  key={component.id}
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <Input
                    aria-label="组分"
                    value={component.species}
                    placeholder="组分，例如 Mo"
                    onChange={(event) =>
                      onChange({
                        components: assertion.components.map((item) =>
                          item.id === component.id
                            ? { ...item, species: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label="分数"
                    type="number"
                    min="0"
                    max="1"
                    step="any"
                    value={component.fraction}
                    placeholder="分数，例如 0.5"
                    onChange={(event) =>
                      onChange({
                        components: assertion.components.map((item) =>
                          item.id === component.id
                            ? { ...item, fraction: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={assertion.components.length === 1}
                    onClick={() =>
                      onChange({
                        components: assertion.components.filter(
                          (item) => item.id !== component.id,
                        ),
                      })
                    }
                  >
                    删除
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="justify-self-start"
                onClick={() =>
                  onChange({
                    components: [
                      ...assertion.components,
                      {
                        id: crypto.randomUUID(),
                        species: '',
                        fraction: '',
                      },
                    ],
                  })
                }
              >
                <Plus data-icon="inline-start" /> 添加组分
              </Button>
              <p className="text-xs text-muted-foreground">
                归一化完整组成；当前分数总和：
                {assertion.components
                  .reduce(
                    (total, component) =>
                      total + Number(component.fraction || 0),
                    0,
                  )
                  .toFixed(6)}
                （须为 1）
              </p>
            </div>
          </>
        ) : (
          <div className="grid gap-2">
            <Label>
              {assertion.type === 'phase_identity'
                ? '物相'
                : assertion.type === 'layer_count'
                  ? '层数'
                  : '结论'}
            </Label>
            <Input
              type={assertion.type === 'layer_count' ? 'number' : 'text'}
              min={assertion.type === 'layer_count' ? '1' : undefined}
              value={assertion.value}
              placeholder={
                assertion.type === 'phase_identity'
                  ? '例如 2H-MoS₂'
                  : '填写结论'
              }
              onChange={(event) => onChange({ value: event.target.value })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ScientificMeasurementWorkspace({
  runId,
  token,
  readOnly,
}: {
  runId: string
  token: string
  readOnly: boolean
}) {
  const queryClient = useQueryClient()
  const samples = useQuery({
    queryKey: ['samples', runId],
    queryFn: () => listSamples(runId, token),
  })
  const measurements = useQuery({
    queryKey: ['measurements', runId],
    queryFn: () => listMeasurements(token, { runId }),
  })
  const [sampleId, setSampleId] = useState('')
  const [method, setMethod] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [instrumentVersion, setInstrumentVersion] = useState<number | null>(
    null,
  )
  const [instrumentSnapshot, setInstrumentSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [measuredAt, setMeasuredAt] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16),
  )
  const [conditions, setConditions] = useState<Record<string, string>>({})
  const [region, setRegion] = useState({
    geometryType: '',
    label: '',
    x: '',
    y: '',
    width: '',
    height: '',
    unit: 'μm',
  })
  const [properties, setProperties] = useState<MeasurementPropertyDraft[]>([])
  const [growth, setGrowth] = useState('')
  const [assertions, setAssertions] = useState<MaterialAssertionDraft[]>([])
  const [software, setSoftware] = useState('')
  const [softwareVersion, setSoftwareVersion] = useState('')
  const [rawFiles, setRawFiles] = useState<File[]>([])

  const selectedSampleId = sampleId
  const selectedSample = samples.data?.items.find(
    (sample) => sample.id === selectedSampleId,
  )
  const profile = characterizationProfiles[method]
  const conditionFields = profile?.condition_fields ?? []
  const assertionTypes = (profile?.allowed_assertion_types ?? []).filter(
    (type) => type !== 'growth_presence',
  )
  const hasEvidence =
    rawFiles.length > 0 ||
    Boolean(growth) ||
    properties.some(
      (property) => property.propertyCode && property.value.trim(),
    ) ||
    assertions.length > 0
  const mutation = useMutation({
    mutationFn: async () => {
      const uploadedFileIds: string[] = []
      try {
        for (const file of rawFiles) {
          const uploaded = await uploadExperimentFile(token, runId, {
            file,
            sampleId: selectedSampleId,
            method,
            assetRole: 'characterization_file',
          })
          uploadedFileIds.push(uploaded.id)
        }
        const typedConditions = Object.fromEntries(
          conditionFields.map((field) => [
            field.key,
            field.components
              ? Object.fromEntries(
                  field.components.map((component) => [
                    component.key,
                    Number(conditions[`${field.key}.${component.key}`]),
                  ]),
                )
              : field.value_type === 'text'
                ? conditions[field.key]
                : Number(conditions[field.key]),
          ]),
        )
        const propertyPayload = properties
          .filter((property) => property.propertyCode && property.value.trim())
          .map((property) => ({
            property_code: property.propertyCode,
            numeric_value: Number(property.value),
            unit: PROPERTY_UNITS[property.propertyCode],
            statistic: 'single_observation',
            ...(property.uncertainty
              ? {
                  uncertainty_value: Number(property.uncertainty),
                  uncertainty_type: property.uncertaintyType,
                }
              : {}),
            ...(property.sampleCount
              ? { sample_count: Number(property.sampleCount) }
              : {}),
            quality_flag: property.quality,
            analysis_index: software ? 0 : undefined,
          }))
        return await createMeasurement(
          {
            measurement: {
              sample_id: selectedSampleId,
              method_profile: method,
              ...(instrumentId
                ? {
                    instrument_id: instrumentId,
                    instrument_version: instrumentVersion,
                  }
                : {}),
              measured_at: new Date(measuredAt).toISOString(),
              sample_region: {
                geometry_type: region.geometryType,
                label: region.label,
                coordinate_system: 'sample_local',
                x: numberOrUndefined(region.x),
                y: numberOrUndefined(region.y),
                width: numberOrUndefined(region.width),
                height: numberOrUndefined(region.height),
                unit: region.unit,
              },
              typed_conditions: typedConditions,
              raw_file_ids: uploadedFileIds,
              quality_flag: 'valid',
            },
            analyses: software
              ? [
                  {
                    software_name: software,
                    software_version: softwareVersion,
                    parameters: {},
                    started_at: new Date(measuredAt).toISOString(),
                    completed_at: new Date().toISOString(),
                    input_file_ids: uploadedFileIds,
                    output_file_ids: [],
                  },
                ]
              : [],
            properties: propertyPayload,
            assertions: [
              ...(growth
                ? [
                    {
                      assertion_type: 'growth_presence',
                      value: { state: growth },
                      confidence: null,
                      analysis_index: software ? 0 : undefined,
                    },
                  ]
                : []),
              ...assertions.map((assertion) => ({
                assertion_type: assertion.type,
                value: materialAssertionValue(
                  assertion.type,
                  assertion.value,
                  assertion.components,
                  assertion.basis,
                ),
                confidence: null,
                analysis_index: software ? 0 : undefined,
              })),
            ],
          },
          token,
        )
      } catch (error) {
        for (const fileId of uploadedFileIds) {
          const uploaded = await getExperimentFile(token, fileId).catch(
            () => null,
          )
          if (uploaded?.characterization_record_id === null) {
            await deleteExperimentFile(token, fileId).catch(() => undefined)
          }
        }
        throw error
      }
    },
    onSuccess: async () => {
      setGrowth('')
      setProperties(
        (METHOD_DEFAULT_PROPERTIES[method] ?? []).map(newPropertyDraft),
      )
      setAssertions([])
      setSoftware('')
      setSoftwareVersion('')
      setRawFiles([])
      await queryClient.invalidateQueries({
        queryKey: ['measurements', runId],
      })
      await queryClient.invalidateQueries({ queryKey: ['samples', runId] })
      toast.success('测量事实已记录')
    },
    onError: (error) =>
      toast.error(resolveErrorMessage(error, '测量记录保存失败')),
  })

  return (
    <ModuleCard id="module-results" title="添加表征记录">
      <Alert>
        <AlertTitle>
          {selectedSample
            ? `正在为 ${selectedSample.run_code ?? '当前炉次'} · ${
                selectedSample.target_material_system ??
                selectedSample.material_system ??
                selectedSample.sample_code
              } 添加表征记录`
            : '正在加载当前炉次的样品'}
        </AlertTitle>
        <AlertDescription>
          依次选择方法、填写测量条件、上传原始数据，再记录结果与材料结论。
        </AlertDescription>
      </Alert>
      <div className="grid gap-4">
        <section className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">1. 选择样品与表征方法</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>样品</Label>
              <Select value={selectedSampleId} onValueChange={setSampleId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择样品" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(samples.data?.items ?? []).map((sample) => (
                      <SelectItem key={sample.id} value={sample.id}>
                        {sample.sample_code} ·{' '}
                        {SAMPLE_ACTUAL_STATE_LABELS[sample.actual_state] ??
                          sample.actual_state}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>表征方法</Label>
              <Select
                value={method}
                onValueChange={(value) => {
                  setMethod(value)
                  setGrowth('')
                  setConditions({})
                  setInstrumentId('')
                  setInstrumentVersion(null)
                  setInstrumentSnapshot(null)
                  setRegion({
                    geometryType: METHOD_GEOMETRIES[value][0],
                    label: '',
                    x: '',
                    y: '',
                    width: '',
                    height: '',
                    unit: 'μm',
                  })
                  setProperties(
                    (METHOD_DEFAULT_PROPERTIES[value] ?? []).map(
                      newPropertyDraft,
                    ),
                  )
                  setAssertions([])
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择表征方法" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {Object.keys(characterizationProfiles).map((value) => (
                      <SelectItem key={value} value={value}>
                        {METHOD_LABELS[value] ?? value}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">2. 仪器与测量条件</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>测量时间</Label>
              <Input
                type="datetime-local"
                value={measuredAt}
                onChange={(event) => setMeasuredAt(event.target.value)}
              />
            </div>
            {profile?.instrument_required ? (
              <div className="grid gap-2">
                <Label>使用的仪器版本</Label>
                <EntityReferenceSelect
                  kind="instrument"
                  value={instrumentId}
                  selectedVersion={instrumentVersion}
                  selectedSnapshot={instrumentSnapshot}
                  onChange={(id, entity) => {
                    setInstrumentId(id)
                    setInstrumentVersion(
                      entity?.latest_version?.version ?? null,
                    )
                    setInstrumentSnapshot(entity?.latest_version?.data ?? null)
                  }}
                />
              </div>
            ) : null}

            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              {conditionFields.map((field) => (
                <div key={field.key} className="grid gap-2">
                  <Label>
                    {field.label_zh}
                    {field.unit ? `（${field.unit}）` : ''}
                  </Label>
                  {field.components ? (
                    <div className="grid grid-cols-2 gap-2">
                      {field.components.map((component) => {
                        const key = `${field.key}.${component.key}`
                        return (
                          <Input
                            key={component.key}
                            type="number"
                            min={field.value_type === 'resolution' ? '1' : '0'}
                            step={
                              field.value_type === 'resolution' ? '1' : 'any'
                            }
                            aria-label={`${field.label_zh} ${component.label_zh}`}
                            placeholder={component.label_zh}
                            value={conditions[key] ?? ''}
                            onChange={(event) =>
                              setConditions((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                          />
                        )
                      })}
                    </div>
                  ) : (
                    <Input
                      type={field.value_type === 'text' ? 'text' : 'number'}
                      step={field.value_type === 'integer' ? '1' : undefined}
                      value={conditions[field.key] ?? ''}
                      onChange={(event) =>
                        setConditions((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
              <h4 className="font-medium sm:col-span-2">测量区域</h4>
              <div className="grid gap-2">
                <Label>区域类型</Label>
                <Select
                  value={region.geometryType}
                  disabled={!method}
                  onValueChange={(geometryType) =>
                    setRegion((current) => ({
                      ...current,
                      geometryType,
                      width: '',
                      height: '',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="先选择表征方法" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {(METHOD_GEOMETRIES[method] ?? []).map((geometry) => (
                        <SelectItem key={geometry} value={geometry}>
                          {GEOMETRY_LABELS[geometry]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{REGION_LABELS.label}</Label>
                <Input
                  value={region.label}
                  placeholder="例如样品中心"
                  onChange={(event) =>
                    setRegion((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                />
              </div>
              {['point', 'line', 'area'].includes(region.geometryType) ? (
                <>
                  <div className="grid gap-2">
                    <Label>{REGION_LABELS.x}</Label>
                    <Input
                      type="number"
                      value={region.x}
                      onChange={(event) =>
                        setRegion((current) => ({
                          ...current,
                          x: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>{REGION_LABELS.y}</Label>
                    <Input
                      type="number"
                      value={region.y}
                      onChange={(event) =>
                        setRegion((current) => ({
                          ...current,
                          y: event.target.value,
                        }))
                      }
                    />
                  </div>
                </>
              ) : null}
              {['line', 'area'].includes(region.geometryType) ? (
                <div className="grid gap-2">
                  <Label>{REGION_LABELS.width}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={region.width}
                    onChange={(event) =>
                      setRegion((current) => ({
                        ...current,
                        width: event.target.value,
                      }))
                    }
                  />
                </div>
              ) : null}
              {region.geometryType === 'area' ? (
                <div className="grid gap-2">
                  <Label>{REGION_LABELS.height}</Label>
                  <Input
                    type="number"
                    min="0"
                    value={region.height}
                    onChange={(event) =>
                      setRegion((current) => ({
                        ...current,
                        height: event.target.value,
                      }))
                    }
                  />
                </div>
              ) : null}
              {['point', 'line', 'area'].includes(region.geometryType) ? (
                <div className="grid gap-2">
                  <Label>{REGION_LABELS.unit}</Label>
                  <Input
                    value={region.unit}
                    onChange={(event) =>
                      setRegion((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">3. 上传原始数据</h3>
          <div className="grid gap-2">
            <Label>原始文件（可多选）</Label>
            <Input
              type="file"
              multiple
              onChange={(event) =>
                setRawFiles(Array.from(event.target.files ?? []))
              }
            />
            <p className="text-xs text-muted-foreground">
              已选择 {rawFiles.length} 个文件。
              {method
                ? ` ${profile?.raw_file_guidance_zh ?? ''}`
                : ' 请先选择表征方法。'}
            </p>
          </div>
        </section>

        <section className="grid gap-4 rounded-lg border p-4">
          <h3 className="font-medium">4. 填写结果与材料结论</h3>
          {profile?.show_growth_presence ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>是否观察到材料生长（选填）</Label>
                <Select value={growth} onValueChange={setGrowth}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择观察结论" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="present">观察到生长</SelectItem>
                      <SelectItem value="absent">未观察到生长</SelectItem>
                      <SelectItem value="uncertain">结论不确定</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">测量结果（可添加多条）</p>
                <p className="text-xs text-muted-foreground">
                  已按表征方法提供常用结果模板；留空的条目不会提交。
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!method}
                onClick={() =>
                  setProperties((current) => [...current, newPropertyDraft()])
                }
              >
                <Plus data-icon="inline-start" /> 添加结果
              </Button>
            </div>
            {properties.map((property) => (
              <MeasurementPropertyEditor
                key={property.id}
                property={property}
                propertyCodes={METHOD_PROPERTY_CODES[method] ?? []}
                onChange={(patch) =>
                  setProperties((current) =>
                    current.map((item) =>
                      item.id === property.id ? { ...item, ...patch } : item,
                    ),
                  )
                }
                onRemove={() =>
                  setProperties((current) =>
                    current.filter((item) => item.id !== property.id),
                  )
                }
              />
            ))}
          </div>

          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">材料结论（可添加多条）</p>
                <p className="text-xs text-muted-foreground">
                  物相、组成、层数与取向分别记录，均与本次测量证据关联。
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={assertionTypes.length === 0}
                onClick={() =>
                  setAssertions((current) => [
                    ...current,
                    newAssertionDraft(assertionTypes[0]),
                  ])
                }
              >
                <Plus data-icon="inline-start" /> 添加材料结论
              </Button>
            </div>
            {assertions.map((assertion) => (
              <MaterialAssertionEditor
                key={assertion.id}
                assertion={assertion}
                assertionTypes={assertionTypes}
                onChange={(patch) =>
                  setAssertions((current) =>
                    current.map((item) =>
                      item.id === assertion.id ? { ...item, ...patch } : item,
                    ),
                  )
                }
                onRemove={() =>
                  setAssertions((current) =>
                    current.filter((item) => item.id !== assertion.id),
                  )
                }
              />
            ))}
          </div>

          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer font-medium">
              分析软件信息
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-2 sm:col-span-2">
                <Label>分析软件（选填）</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={software}
                    placeholder="软件或脚本"
                    onChange={(event) => setSoftware(event.target.value)}
                  />
                  <Input
                    value={softwareVersion}
                    placeholder="版本"
                    onChange={(event) => setSoftwareVersion(event.target.value)}
                  />
                </div>
              </div>
            </div>
          </details>
        </section>

        <Button
          type="button"
          className="justify-self-end"
          disabled={
            readOnly ||
            !selectedSampleId ||
            !method ||
            !hasEvidence ||
            (profile?.instrument_required &&
              (!instrumentId || instrumentVersion === null)) ||
            !regionDraftValid(region) ||
            conditionFields.some((field) =>
              field.components
                ? field.components.some(
                    (component) => !conditions[`${field.key}.${component.key}`],
                  )
                : !conditions[field.key],
            ) ||
            properties.some((property) => !propertyDraftValid(property)) ||
            assertions.some((assertion) => !assertionDraftValid(assertion)) ||
            (profile?.raw_files_required && rawFiles.length === 0) ||
            Boolean(software) !== Boolean(softwareVersion) ||
            (software !== '' && rawFiles.length === 0) ||
            mutation.isPending
          }
          onClick={() => mutation.mutate()}
        >
          保存表征记录
        </Button>
      </div>

      <section className="grid gap-3">
        <h3 className="font-medium">当前炉次的表征记录</h3>
        {measurements.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {resolveErrorMessage(measurements.error, '表征记录加载失败')}
            </AlertDescription>
          </Alert>
        ) : measurements.isLoading ? (
          <p className="text-sm text-muted-foreground">正在加载表征记录…</p>
        ) : measurements.data?.items.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {measurements.data.items.map((item) => (
              <div
                key={item.id}
                className="grid gap-2 rounded-lg border px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{item.sample_code}</span>
                  <Badge variant="secondary">
                    {METHOD_LABELS[item.method_profile] ?? item.method_profile}
                  </Badge>
                </div>
                <span className="text-muted-foreground">
                  {new Date(item.measured_at).toLocaleString()}
                </span>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span>原始文件 {item.raw_file_count}</span>
                  <span>测量结果 {item.property_count}</span>
                  <span>材料结论 {item.assertion_count}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            当前炉次还没有表征记录。
          </p>
        )}
      </section>
    </ModuleCard>
  )
}
