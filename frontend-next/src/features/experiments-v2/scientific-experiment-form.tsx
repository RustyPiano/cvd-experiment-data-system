import { SimpleTargetEditor } from './simple-target-editor'
import { additionalCapabilityNames } from '@/shared/additional-capabilities'
import { useEffect, useRef, useState } from 'react'
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

import { useAuth } from '@/features/auth/use-auth'
import { uploadExperimentFile } from '@/features/samples/api'
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
import { RequiredMark } from '@/shared/ui/required-mark'
import { gasSpecies, optionLabelsZh } from '@/shared/generated/field-metadata'
import {
  createRun,
  listContributors,
  setSetupReference,
  upsertModule,
} from './api'
import type { V2ModulePayloadRead } from './api'
import type { ExperimentV2FormState } from './form-types'
import { buildSubstratesPayload } from './field-logic'
import {
  channelsForSetupZoneCount,
  peakTemperatureC,
  processChannelTitle,
  saveBeforeStepChange,
  targetSummary,
  targetValidationIssue,
  timelineValidationIssue,
  tubeUsageParts,
  tubeUsagePartsValidity,
  withProcessChannelSubject,
} from './scientific-form-workflow'
import { ModuleCard } from './components/module-card'
import { EntityReferenceSelect } from './components/entity-reference-select'
import {
  actualFieldTypes,
  fieldParamsAreValid,
} from './components/process-detail-editors'
import type { ActualField } from './components/process-detail-editors'
import { materialLotProjectedItem } from './material-lot-projection'
import {
  SimpleGrowthEditor,
  SimpleSourceLoadsEditor,
  SimpleSubstratesEditor,
  requiresPrecursorPosition,
  simpleSubstrateRelationsAreValid,
  simpleSubstrateIsValid,
  sourceLoadIngredientsAreValid,
  sourcePreparationStepsAreValid,
  sourceSolutionMode,
  sourceSolutionVolumesRecorded,
  switchTargetDraft,
  targetKind,
} from './simple-preparation-editors'
import type {
  SimpleProcessSettings,
  SimpleTarget,
  TargetDrafts,
  TargetKind,
} from './simple-preparation-editors'
import {
  PROCESS_DEVIATION_OPTIONS,
  buildSimpleSourceLoadsPayload,
  simpleProcessEndSeconds,
  simpleGrowthIssue,
  simpleProcessEventsIssue,
} from './simple-form-adapters'

type Region = {
  region_key: string
  formula: string
  spatial_role: 'single_region' | 'layer' | 'lateral_region' | 'mixed_region'
  layer_index?: number
  lateral_region?: string
  target_layer_count?: number
  target_bulk_phase?: string
  target_bulk_space_group_number?: number
}

type CompositionRelation = {
  relation_type:
    | 'doped_by'
    | 'substitutional_alloy'
    | 'solid_solution_component'
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
  film_form?: 'discrete' | 'continuous'
  dimensional_form_other?: string
  in_plane_outline_other?: string
  dimensional_form?:
    | 'planar'
    | 'continuous_film'
    | 'discrete_planar_crystal'
    | 'ribbon'
    | 'wire'
    | 'tube'
    | 'rod'
    | 'particle'
    | 'bulk_crystal'
    | 'other'
  in_plane_outline?:
    | 'triangle'
    | 'truncated_triangle'
    | 'hexagon'
    | 'quadrilateral'
    | 'other_regular_polygon'
    | 'circular_elliptical'
    | 'lobed_star'
    | 'dendritic_fractal'
    | 'irregular'
    | 'other'
  optimization_objective?: string
  note?: string
}

type Ingredient = {
  material_lot_id: string
  material_lot_version: number
  function_role?: string
  amount?: number
  unit?: string
  concentration_value?: number
  concentration_unit?: string
  concentration_unit_other?: string
  snapshot?: Record<string, unknown>
}

type SourceLoad = {
  attrs?: Record<string, unknown>
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
    reference: 'setup_origin' | 'zone_thermocouple'
  }
  position_program: Array<{
    t_s: number
    axial_mm: number
    radial_mm?: number
    azimuth_deg?: number
    reference: 'setup_origin' | 'zone_thermocouple'
  }>
  heating_zone_ref?: string
  substrate_source_ids?: string[]
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
type ProcessEventsPayload = {
  items: ProcessEvent[]
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

const PRESERVED_PROCESS_FIELDS = [
  'reaction_timer_origin',
  'reaction_timer_origin_other',
  'post_reaction_operations',
] as const

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
  system_preparation: '实验前准备',
  pre_reaction: '温度程序',
  reaction: '反应',
  post_reaction: '反应后处理',
  cooling: '降温',
  other: '其他阶段',
  purge: '系统准备（历史记录）',
  ramp: '升降温（历史记录）',
  nucleation: '成核（历史记录）',
  growth: '生长（历史记录）',
  anneal: '退火（历史记录）',
  transfer: '转移（历史记录）',
}
const EVENT_OPTIONS = {
  observed_deviations: PROCESS_DEVIATION_OPTIONS,
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
export const WORKFLOW_STEPS = [
  '基本信息',
  '目标材料',
  '装置与衬底',
  '前驱体装载',
  '生长条件',
  '检查并提交',
] as const

const STEP_MODULES = [
  ['basic_info'],
  ['target_product'],
  ['equipment', 'substrates'],
  ['precursors'],
  ['process_steps', 'process_events'],
  [],
] as const

const PRESSURE_REGIME_LABELS: Record<string, string> = {
  atmospheric: '常压',
  low_pressure: '减压（含真空）',
  ultra_high_vacuum: '减压（含真空）',
  high_pressure: '加压',
  other: '其他',
}

function normalizedCoolingMethod(
  value: unknown,
): SimpleProcessSettings['cooling_method'] {
  return ({
    natural: 'furnace_cooling',
    rapid_furnace_move: 'rapid_furnace_move_cooling',
    controlled: 'controlled_cooling',
  }[String(value)] ?? value) as SimpleProcessSettings['cooling_method']
}

function stepForModule(module: string): number {
  if (['characterization', 'measured_products'].includes(module)) return 5
  const index = STEP_MODULES.findIndex((modules) =>
    (modules as readonly string[]).includes(module),
  )
  return index < 0 ? 0 : index
}

function numberOrUndefined(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value)
}

function machineKey(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '_')}`
}

function ambientComplete(
  value: AmbientFormValue | undefined,
  humidity = false,
): boolean {
  return (
    value === undefined ||
    value.source_type === 'not_measured' ||
    (Number.isFinite(value.value) &&
      (!humidity ||
        ((value.value ?? -1) >= 0 && (value.value ?? 101) <= 100)) &&
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

function ambientSummary(value: AmbientFormValue | undefined, unit: string) {
  return value?.source_type === 'not_measured' || value?.value === undefined
    ? '未测量'
    : `${value.value} ${unit}`
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
  const targetDrafts = useRef<TargetDrafts>({
    [targetKind(target as SimpleTarget)]: target as SimpleTarget,
  })
  const [loads, setLoads] = useState<SourceLoad[]>(() => {
    const items = modulePayload<{ items: SourceLoad[] }>(
      modules,
      'precursors',
      {
        items: [],
      },
    ).items
    return items.map((load) => ({
      ...load,
      substrate_source_ids: load.substrate_source_ids ?? [],
      ingredients: load.ingredients.map((ingredient) => ({
        ...ingredient,
      })),
    }))
  })
  const [initialProcessPayload] = useState(() =>
    modulePayload<Record<string, unknown>>(
      modules,
      'process_steps',
      EMPTY_TIMELINE,
    ),
  )
  const [segments, setSegments] = useState<Segment[]>(() =>
    Array.isArray(initialProcessPayload['segments'])
      ? (initialProcessPayload['segments'] as Segment[])
      : [],
  )
  const [channels, setChannels] = useState<Channel[]>(() =>
    Array.isArray(initialProcessPayload['channels'])
      ? (initialProcessPayload['channels'] as Channel[])
      : [],
  )
  const [preservedProcessFields] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      PRESERVED_PROCESS_FIELDS.filter(
        (key) => key in initialProcessPayload,
      ).map((key) => [key, initialProcessPayload[key]]),
    ),
  )
  const [processSettings, setProcessSettings] = useState<SimpleProcessSettings>(
    () => {
      const payload = initialProcessPayload
      const legacyExternalFields = Array.isArray(payload['external_fields'])
        ? (payload['external_fields'] as string[])
        : []
      const fieldParams = Array.isArray(payload['field_params'])
        ? (payload['field_params'] as ActualField[])
        : legacyExternalFields
            .filter((item) =>
              actualFieldTypes.includes(
                item as (typeof actualFieldTypes)[number],
              ),
            )
            .map((field_type) => ({
              field_type: field_type as ActualField['field_type'],
              start_min: null,
              end_min: null,
              parameters: [],
            }))
      return {
        process_duration_min: payload['process_duration_min'] as
          | number
          | undefined,
        cooling_sequence: payload[
          'cooling_sequence'
        ] as SimpleProcessSettings['cooling_sequence'],
        pressure_regime: payload[
          'pressure_regime'
        ] as SimpleProcessSettings['pressure_regime'],
        cooling_method: normalizedCoolingMethod(payload['cooling_method']),
        cooling_other: payload['cooling_other'] as string | undefined,
        cooling_rate_C_per_min: payload['cooling_rate_C_per_min'] as
          | number
          | undefined,
        lid_open_temperature_C: payload['lid_open_temperature_C'] as
          | number
          | undefined,
        preparation_operations: Array.isArray(payload['preparation_operations'])
          ? (payload[
              'preparation_operations'
            ] as SimpleProcessSettings['preparation_operations'])
          : [],
        field_params: fieldParams,
        external_fields: legacyExternalFields,
      }
    },
  )
  const [initialEventsPayload] = useState(() =>
    modulePayload<ProcessEventsPayload>(modules, 'process_events', {
      items: [],
    }),
  )
  const [events, setEvents] = useState<ProcessEvent[]>(
    () => initialEventsPayload.items,
  )
  const [processEventsConfirmed, setProcessEventsConfirmed] = useState<
    boolean | null
  >(() => {
    const savedConfirmation = initialProcessPayload['process_events_confirmed']
    if (typeof savedConfirmation === 'boolean') return savedConfirmation
    return modules?.process_events
      ? initialEventsPayload.items.length > 0
      : false
  })
  const [substrates, setSubstrates] = useState(initialState.substrates)
  const [substratePlacementRelations, setSubstratePlacementRelations] =
    useState(initialState.substratePlacementRelations)
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
      const message = resolveErrorMessage(
        error,
        '保存失败，请检查当前步骤的填写内容',
      )
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
                !ambientComplete(humidityAmbient, true) ||
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
  const initialSetupZoneCount =
    Number(initialState.equipment.snapshot?.['zone_count']) || null
  const shrinkingSetup = Boolean(
    equipment.setupId !== initialState.equipment.setupId &&
    setupZoneCount &&
    initialSetupZoneCount &&
    setupZoneCount < initialSetupZoneCount,
  )
  const [tubeResetCount, tubeUseNumber] = tubeUsageParts(
    equipment.tubeUsageHistory,
  )
  const [tubeResetCountValid, tubeUseNumberValid] = tubeUsagePartsValidity(
    equipment.tubeUsageHistory,
  )
  const tubeUsageComplete = tubeResetCountValid && tubeUseNumberValid
  const showBasicErrors = Boolean(errors.basic_info)
  const showEquipmentErrors = Boolean(errors.equipment)
  const targetDisplay = targetSummary(target)
  const setupName = String(
    equipment.snapshot?.['setup_name'] ??
      equipment.snapshot?.['name'] ??
      equipment.snapshot?.['setup_code'] ??
      '',
  )
  const setupFieldDevices = Array.isArray(equipment.snapshot?.['field_devices'])
    ? (equipment.snapshot?.['field_devices'] as string[])
    : []
  const setupFieldTypes = setupFieldDevices.filter((item) =>
    actualFieldTypes.includes(item as (typeof actualFieldTypes)[number]),
  ) as (typeof actualFieldTypes)[number][]
  const processFieldParamsValid = fieldParamsAreValid(
    processSettings.field_params ?? [],
    setupFieldTypes,
    additionalCapabilityNames(equipment.snapshot),
  )
  const totalDuration =
    processSettings.process_duration_min !== undefined
      ? processSettings.process_duration_min * 60
      : simpleProcessEndSeconds(
          segments,
          channels,
          processSettings.field_params,
          events,
        )
  const peakTemperature = peakTemperatureC(channels)
  const hasTemperatureFile = channels.some(
    (channel) =>
      channel.channel_type === 'temperature' &&
      channel.data_kind === 'timeseries_file',
  )
  const processTimelineIssue =
    (processEventsConfirmed && events.length === 0
      ? '请至少添加一条异常事件。'
      : null) ??
    simpleGrowthIssue(
      segments,
      channels,
      processSettings,
      setupZoneCount,
      processFieldParamsValid,
    ) ??
    timelineValidationIssue(segments, channels) ??
    simpleProcessEventsIssue(events)
  const targetIssue = targetValidationIssue(target)
  const startedAtValid = Boolean(
    basicInfo.started_at &&
    !Number.isNaN(new Date(basicInfo.started_at).getTime()),
  )
  const roomTemperatureValid = ambientComplete(basicInfo.ambient_temperature)
  const roomHumidityValid = ambientComplete(basicInfo.ambient_humidity, true)
  const basicComplete = Boolean(
    startedAtValid &&
    basicInfo.performed_by_user_ids.length &&
    roomTemperatureValid &&
    roomHumidityValid,
  )
  const targetComplete = targetIssue === null
  const equipmentComplete = Boolean(equipment.setupId && tubeUsageComplete)
  const substratesComplete = Boolean(
    substrates.length &&
    substrates.every((substrate) =>
      simpleSubstrateIsValid(substrate, setupZoneCount),
    ) &&
    simpleSubstrateRelationsAreValid(substrates, substratePlacementRelations),
  )
  const substrateSourceIds = new Set(
    substrates
      .map((substrate) => String(substrate['source_id'] ?? ''))
      .filter(Boolean),
  )
  const precursorsComplete = Boolean(
    loads.length &&
    loads.every(
      (load) =>
        load.loading_method &&
        (load.loading_method !== 'other' ||
          Boolean(String(load.attrs?.loading_other ?? '').trim())) &&
        sourcePreparationStepsAreValid(
          load.preparation_steps,
          load.loading_method,
        ) &&
        (!requiresPrecursorPosition(load.loading_method) ||
          (Boolean(load.heating_zone_ref) &&
            Number(load.heating_zone_ref?.replace('zone_', '')) >= 1 &&
            Number(load.heating_zone_ref?.replace('zone_', '')) <=
              (setupZoneCount ?? 0) &&
            Number.isFinite(load.initial_position?.axial_mm) &&
            load.initial_position?.reference === 'zone_thermocouple')) &&
        (load.loading_method !== 'substrate_surface' ||
          ((load.substrate_source_ids ?? []).length > 0 &&
            (load.substrate_source_ids ?? []).every((sourceId) =>
              substrateSourceIds.has(sourceId),
            ))) &&
        sourceLoadIngredientsAreValid(
          load.ingredients,
          sourceSolutionMode(load.preparation_steps).hasSolution,
          load.loading_method !== 'gas_line' &&
            !sourceSolutionMode(load.preparation_steps).immersionOnly &&
            !sourceSolutionVolumesRecorded(load.preparation_steps),
          sourceSolutionMode(load.preparation_steps).concentrationRequired,
          sourceSolutionMode(load.preparation_steps).volumeRequired &&
            !sourceSolutionVolumesRecorded(load.preparation_steps),
        ),
    ),
  )
  const completedSteps = [
    basicComplete,
    targetComplete,
    equipmentComplete && substratesComplete,
    precursorsComplete,
    processTimelineIssue === null,
  ].filter(Boolean).length
  const stepCompleteness = [
    basicComplete,
    targetComplete,
    equipmentComplete && substratesComplete,
    precursorsComplete,
    processTimelineIssue === null,
  ]

  const payloadFor = (key: string): Record<string, unknown> => {
    if (key === 'basic_info') return basicInfo
    if (key === 'target_product') return target
    if (key === 'precursors') return buildSimpleSourceLoadsPayload(loads)
    if (key === 'substrates') {
      return buildSubstratesPayload(
        substrates.map((item) => materialLotProjectedItem(item)),
        substratePlacementRelations,
      )
    }
    if (key === 'process_steps') {
      return {
        segments,
        channels,
        process_events_confirmed: processEventsConfirmed,
        ...processSettings,
        ...preservedProcessFields,
      }
    }
    if (key === 'process_events') return { items: events }
    return {}
  }

  const saveCurrentStep = async () => {
    if (activeStep === 0 && !basicComplete) {
      setErrors((current) => ({
        ...current,
        basic_info: [
          !startedAtValid && '请选择有效的开始时间。',
          !basicInfo.performed_by_user_ids.length && '请至少选择一名实验人员。',
          !roomTemperatureValid && '请填写有效的实验室温度。',
          !roomHumidityValid && '请填写 0–100 之间的相对湿度。',
        ]
          .filter(Boolean)
          .join(''),
      }))
      return false
    }
    if (activeStep === 1 && !targetComplete) {
      setErrors((current) => ({
        ...current,
        target_product: targetIssue ?? '请补齐目标材料。',
      }))
      return false
    }
    if (activeStep === 2 && !(equipmentComplete && substratesComplete)) {
      setErrors((current) => ({
        ...current,
        equipment:
          '请选择实验装置，填写炉管使用履历，并补齐每片衬底的必填信息。',
        substrates: '请补齐每片衬底的批次、尺寸、轴向位置和生长面朝向。',
      }))
      return false
    }
    if (activeStep === 3 && !precursorsComplete) {
      setErrors((current) => ({
        ...current,
        precursors:
          '请补齐每处前驱体装载的必填信息；衬底表面装载请关联至少一片衬底。',
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
    const keys = STEP_MODULES[activeStep].filter(
      (key) => dirty.has(key) && !(key === 'equipment' && shrinkingSetup),
    )
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
  const dirtyStepLabels = WORKFLOW_STEPS.slice(0, -1).filter((_, index) =>
    STEP_MODULES[index].some((key) => dirty.has(key)),
  )
  const precheckConfirmed = basicInfo.precheck?.['confirmed'] === true
  const reviewCardAction = processReadOnly
    ? '点击查看对应步骤'
    : '点击返回对应步骤修改'

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
      equipmentComplete && substratesComplete,
      precursorsComplete,
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
      'substrates',
      'precursors',
      'process_steps',
      'process_events',
      'equipment',
    ]) {
      if (dirty.has(key) && !(await save(key, payloadFor(key)))) return
    }
    onRequestLock?.()
  }

  return (
    <div className="grid gap-6">
      <Card size="sm">
        <CardHeader className="border-b">
          <CardTitle>
            第 {activeStep + 1}/{WORKFLOW_STEPS.length} 步 ·{' '}
            {WORKFLOW_STEPS[activeStep]}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 sm:grid-cols-3 xl:grid-cols-6">
          {WORKFLOW_STEPS.map((step, index) => {
            const complete =
              (index < stepCompleteness.length
                ? stepCompleteness[index]
                : completedSteps === stepCompleteness.length) &&
              !STEP_MODULES[index].some((key) => dirty.has(key))
            return (
              <Button
                key={step}
                type="button"
                variant={index === activeStep ? 'secondary' : 'ghost'}
                className="h-auto justify-start py-2 text-left whitespace-normal"
                aria-current={index === activeStep ? 'step' : undefined}
                onClick={() => void showStep(index)}
              >
                {complete && index !== activeStep ? (
                  <Check data-icon="inline-start" />
                ) : (
                  <span className="tabular-nums">{index + 1}.</span>
                )}
                {step}
              </Button>
            )
          })}
        </CardContent>
      </Card>

      {dirtyStepLabels.length ? (
        <Alert>
          <AlertDescription>
            {dirtyStepLabels.join('、')}
            有未保存的修改。
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div id={`experiment-step-${activeStep + 1}`} className="grid gap-6">
          {activeStep === 0 ? (
            <ModuleCard id="module-basic_info" title="基本信息">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>实验编号</Label>
                  <Input value={runCode ?? ''} readOnly />
                </div>
                <div
                  className="grid gap-2"
                  data-invalid={
                    (showBasicErrors && !startedAtValid) || undefined
                  }
                >
                  <Label htmlFor="experiment-started-at">
                    开始时间 <RequiredMark />
                  </Label>
                  <Input
                    id="experiment-started-at"
                    type="datetime-local"
                    required
                    value={toLocalDateTime(basicInfo.started_at)}
                    disabled={processReadOnly}
                    aria-invalid={
                      (showBasicErrors && !startedAtValid) || undefined
                    }
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
                  {showBasicErrors && !startedAtValid ? (
                    <p className="text-destructive text-sm">
                      请选择有效的开始时间。
                    </p>
                  ) : null}
                </div>
                <fieldset
                  className="grid gap-2 rounded-lg border p-3 sm:col-span-2"
                  data-invalid={
                    (showBasicErrors &&
                      basicInfo.performed_by_user_ids.length === 0) ||
                    undefined
                  }
                >
                  <legend className="px-1 text-sm font-medium">
                    实验人员 <RequiredMark />
                  </legend>
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
                  {showBasicErrors &&
                  basicInfo.performed_by_user_ids.length === 0 ? (
                    <p className="text-destructive text-sm">
                      请至少选择一名实验人员。
                    </p>
                  ) : null}
                </fieldset>
                <div
                  className="grid gap-2"
                  data-invalid={
                    (showBasicErrors && !roomTemperatureValid) || undefined
                  }
                >
                  <Label htmlFor="experiment-room-temperature">
                    实验室温度（℃）
                  </Label>
                  <Input
                    id="experiment-room-temperature"
                    type="number"
                    step="any"
                    value={basicInfo.ambient_temperature?.value ?? ''}
                    disabled={processReadOnly}
                    aria-invalid={
                      (showBasicErrors && !roomTemperatureValid) || undefined
                    }
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
                  {showBasicErrors && !roomTemperatureValid ? (
                    <p className="text-destructive text-sm">
                      请填写有效的实验室温度。
                    </p>
                  ) : null}
                </div>
                <div
                  className="grid gap-2"
                  data-invalid={
                    (showBasicErrors && !roomHumidityValid) || undefined
                  }
                >
                  <Label htmlFor="experiment-room-humidity">
                    实验室相对湿度（%RH）
                  </Label>
                  <Input
                    id="experiment-room-humidity"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={basicInfo.ambient_humidity?.value ?? ''}
                    disabled={processReadOnly}
                    aria-invalid={
                      (showBasicErrors && !roomHumidityValid) || undefined
                    }
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
                  {showBasicErrors && !roomHumidityValid ? (
                    <p className="text-destructive text-sm">
                      请填写 0–100 之间的相对湿度。
                    </p>
                  ) : null}
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
              disabled={processReadOnly}
              showErrors={Boolean(errors.target_product)}
              onChange={(value) => {
                targetDrafts.current[targetKind(value)] = value
                setTarget({ ...target, ...value })
                markDirty('target_product')
              }}
              onKindChange={(kind: TargetKind) => {
                const [next, drafts] = switchTargetDraft(
                  target as SimpleTarget,
                  kind,
                  targetDrafts.current,
                )
                targetDrafts.current = drafts
                setTarget(next)
                markDirty('target_product')
              }}
            />
          ) : null}

          {activeStep === 2 ? (
            <>
              <ModuleCard id="module-equipment" title="实验装置与炉管履历">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div
                    className="grid gap-2 sm:col-span-2"
                    data-invalid={
                      (showEquipmentErrors && !equipment.setupId) || undefined
                    }
                  >
                    <Label>
                      实验装置 <span className="text-destructive">*</span>
                    </Label>
                    <EntityReferenceSelect
                      kind="setup"
                      value={equipment.setupId}
                      selectedVersion={equipment.version}
                      selectedSnapshot={equipment.snapshot}
                      disabled={processReadOnly}
                      onChange={(id, entity) => {
                        const snapshot = entity?.latest_version?.data ?? null
                        const nextZoneCount = Number(snapshot?.zone_count) || 0
                        const retainedChannels = channelsForSetupZoneCount(
                          channels,
                          nextZoneCount,
                        )
                        const removesTemperatureChannels =
                          retainedChannels.length !== channels.length
                        if (
                          removesTemperatureChannels &&
                          !window.confirm(
                            '新装置的温区更少，超出范围的温度程序将被移除；请继续检查衬底和前驱体的温区位置。是否继续？',
                          )
                        ) {
                          return
                        }
                        setEquipment({
                          ...equipment,
                          setupId: id,
                          version: entity?.latest_version?.version ?? null,
                          snapshot,
                        })
                        if (removesTemperatureChannels) {
                          setChannels(retainedChannels)
                          markDirty('process_steps')
                        }
                        markDirty('equipment')
                      }}
                    />
                    {showEquipmentErrors && !equipment.setupId ? (
                      <p className="text-destructive text-sm">
                        请选择实验装置。
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="grid gap-2"
                    data-invalid={
                      (showEquipmentErrors && !tubeResetCountValid) || undefined
                    }
                  >
                    <Label htmlFor="tube-reset-count">
                      清洗或更换累计次数{' '}
                      <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="tube-reset-count"
                        type="number"
                        min="0"
                        value={tubeResetCount}
                        disabled={processReadOnly}
                        aria-invalid={
                          (showEquipmentErrors && !tubeResetCountValid) ||
                          undefined
                        }
                        onChange={(event) => {
                          setEquipment({
                            ...equipment,
                            tubeUsageHistory: `${event.target.value},${tubeUseNumber}`,
                          })
                          markDirty('equipment')
                        }}
                      />
                      <span className="text-sm">次</span>
                    </div>
                    {showEquipmentErrors && !tubeResetCountValid ? (
                      <p className="text-destructive text-sm">
                        请填写累计次数；从未清洗或更换过填 0。
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="grid gap-2"
                    data-invalid={
                      (showEquipmentErrors && !tubeUseNumberValid) || undefined
                    }
                  >
                    <Label htmlFor="tube-use-number">
                      清洗或更换后第几炉{' '}
                      <span className="text-destructive">*</span>
                    </Label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">第</span>
                      <Input
                        id="tube-use-number"
                        type="number"
                        min="1"
                        value={tubeUseNumber}
                        disabled={processReadOnly}
                        aria-invalid={
                          (showEquipmentErrors && !tubeUseNumberValid) ||
                          undefined
                        }
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
                    {showEquipmentErrors && !tubeUseNumberValid ? (
                      <p className="text-destructive text-sm">
                        请填写本次使用序号，从 1 开始。
                      </p>
                    ) : null}
                  </div>
                </div>
              </ModuleCard>
              <SimpleSubstratesEditor
                substrates={substrates}
                placementRelations={substratePlacementRelations}
                zoneCount={setupZoneCount}
                disabled={processReadOnly}
                showErrors={Boolean(errors.substrates)}
                onChange={(value) => {
                  setSubstrates(value)
                  markDirty('substrates')
                }}
                onPlacementRelationsChange={(value) => {
                  setSubstratePlacementRelations(value)
                  markDirty('substrates')
                }}
              />
            </>
          ) : null}

          {activeStep === 3 ? (
            <SimpleSourceLoadsEditor
              loads={loads}
              substrates={substrates}
              zoneCount={setupZoneCount}
              disabled={processReadOnly}
              showErrors={Boolean(errors.precursors)}
              onChange={(value) => {
                setLoads(value)
                setErrors((current) => ({ ...current, precursors: '' }))
                markDirty('precursors')
              }}
            />
          ) : null}

          {activeStep === 4 ? (
            <SimpleGrowthEditor
              segments={segments}
              channels={channels}
              settings={processSettings}
              events={events}
              processEventsConfirmed={processEventsConfirmed}
              runId={runId ?? ''}
              token={token}
              setupId={equipment.setupId}
              setupSnapshot={equipment.snapshot}
              zoneCount={setupZoneCount}
              disabled={processReadOnly}
              showErrors={Boolean(
                errors.process_steps || errors.process_events,
              )}
              validationIssue={processTimelineIssue}
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
                setErrors((current) => ({
                  ...current,
                  process_steps: '',
                  process_events: '',
                }))
                markDirty('process_events')
                markDirty('process_steps')
              }}
              onProcessEventsConfirmedChange={(value) => {
                setProcessEventsConfirmed(value)
                setErrors((current) => ({
                  ...current,
                  process_steps: '',
                  process_events: '',
                }))
                markDirty('process_steps')
              }}
            />
          ) : null}

          {activeStep === 5 ? (
            <ModuleCard title="检查并提交">
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    label: '基本信息',
                    value: basicComplete
                      ? `${basicInfo.performed_by_user_ids.length} 名实验人员 · 温度${ambientSummary(basicInfo.ambient_temperature, '℃')} · 湿度${ambientSummary(basicInfo.ambient_humidity, '%RH')}`
                      : '待填写（必填）',
                    complete: basicComplete,
                    step: 0,
                  },
                  {
                    label: '目标材料',
                    value: targetDisplay || '待填写（必填）',
                    complete: targetComplete,
                    step: 1,
                  },
                  {
                    label: '实验装置',
                    value: setupName || '待选择（必填）',
                    complete: equipmentComplete,
                    step: 2,
                  },
                  {
                    label: '前驱体装载',
                    value: loads.length
                      ? `${loads.length} 处装载`
                      : '待填写（必填）',
                    complete: precursorsComplete,
                    step: 3,
                  },
                  {
                    label: '衬底',
                    value: substrates.length
                      ? `${substrates.length} 片`
                      : '待填写（必填）',
                    complete: substratesComplete,
                    step: 2,
                  },
                  {
                    label: '温度程序',
                    value: channels.filter(
                      (channel) =>
                        channel.channel_type === 'temperature' &&
                        channel.source_type === 'setpoint',
                    ).length
                      ? `${
                          channels.filter(
                            (channel) =>
                              channel.channel_type === 'temperature' &&
                              channel.source_type === 'setpoint',
                          ).length
                        } 个温区`
                      : '待填写（必填）',
                    complete: channels.some(
                      (channel) =>
                        channel.channel_type === 'temperature' &&
                        channel.source_type === 'setpoint',
                    ),
                    step: 4,
                  },
                  {
                    label: '气体程序',
                    value: channels.filter(
                      (channel) => channel.channel_type === 'flow',
                    ).length
                      ? `${
                          channels.filter(
                            (channel) => channel.channel_type === 'flow',
                          ).length
                        } 条供气记录`
                      : '待填写（必填）',
                    complete: channels.some(
                      (channel) => channel.channel_type === 'flow',
                    ),
                    step: 4,
                  },
                  {
                    label: '压力',
                    value:
                      PRESSURE_REGIME_LABELS[
                        processSettings.pressure_regime ?? ''
                      ] ?? '待填写（必填）',
                    complete: Boolean(processSettings.pressure_regime),
                    step: 4,
                  },
                  {
                    label: '降温方式',
                    value:
                      optionLabelsZh[processSettings.cooling_method ?? ''] ??
                      '待填写（必填）',
                    complete: Boolean(processSettings.cooling_method),
                    step: 4,
                  },
                  {
                    label: '异常情况',
                    value: events.length ? '有异常记录' : '无异常',
                    complete: true,
                    step: 4,
                  },
                ].map(({ label, value, complete, step }) => (
                  <Button
                    key={label}
                    type="button"
                    variant={complete ? 'outline' : 'destructive'}
                    className="h-auto min-h-16 flex-col items-start gap-1 whitespace-normal p-3 text-left"
                    title={reviewCardAction}
                    aria-label={`${label}：${value}，${reviewCardAction}`}
                    onClick={() => void showStep(step)}
                  >
                    <span className="text-xs text-muted-foreground">
                      {label}
                    </span>
                    <span className="font-medium">{value}</span>
                  </Button>
                ))}
              </div>
              {[
                basicComplete,
                targetComplete,
                equipmentComplete && substratesComplete,
                precursorsComplete,
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
                            equipmentComplete && substratesComplete,
                            precursorsComplete,
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
                          search: { runId, sampleId: undefined },
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
                      const nextBasicInfo = {
                        ...basicInfo,
                        precheck: {
                          checklist_version: 'cvd-precheck-v1',
                          confirmed: checked === true,
                          confirmed_at: new Date().toISOString(),
                        },
                      }
                      setBasicInfo(nextBasicInfo)
                      markDirty('basic_info')
                      void save('basic_info', nextBasicInfo)
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

        <Card size="sm" className="hidden xl:sticky xl:top-20 xl:block">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>当前炉次预览</CardTitle>
              {dirty.size ? <Badge variant="outline">未保存</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {[
              ['实验编号', runCode || '尚未生成'],
              ['目标材料', targetDisplay || '尚未填写'],
              ['实验装置', setupName || '尚未选择'],
              [
                '衬底',
                substrates.length ? `${substrates.length} 片` : '尚未添加',
              ],
              [
                '生长条件',
                [
                  peakTemperature === null
                    ? ''
                    : `最高设定温度 ${Number(peakTemperature.toFixed(2))} ℃`,
                  hasTemperatureFile ? '含温度时间序列' : '',
                  totalDuration ? `${Math.round(totalDuration / 60)} min` : '',
                ]
                  .filter(Boolean)
                  .join(' · ') || '尚未填写',
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
                  {savingKey ? '保存中…' : '仅保存'}
                </Button>
                <Button
                  type="button"
                  disabled={savingKey !== null}
                  onClick={() => void showNextStep()}
                >
                  {currentStepDirty ? '保存并下一步' : '下一步'}
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
  return (
    <SimpleTargetEditor
      target={target as SimpleTarget}
      onChange={onChange}
      disabled={disabled}
    />
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
              按实际操作填写系统准备、预处理、反应、反应后处理和降温。
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
                    segment_type: segments.length === 0 ? 'reaction' : 'other',
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
                        'system_preparation',
                        'pre_reaction',
                        'reaction',
                        'post_reaction',
                        'cooling',
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
                <Label>阶段名称</Label>
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
                    <Label>气瓶批次（物料批次库）</Label>
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
          发生异常、计划变更或数据失效时记录。
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
            <Label>结束时间（s）</Label>
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
