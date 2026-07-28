import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import type { V2EntityRead } from '@/features/entity-library/api'
import { useAuth } from '@/features/auth/use-auth'
import { uploadExperimentFile } from '@/features/samples/api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  createMeasurement,
  createRun,
  listContainerInstances,
  listMeasurements,
  listSamples,
  setSetupReference,
  upsertModule,
} from './api'
import type { V2ModulePayloadRead } from './api'
import type { ExperimentV2FormState, ModuleSaveProps } from './form-types'
import { buildItemsModulePayload } from './field-logic'
import { ModuleCard } from './components/module-card'
import { EntityReferenceSelect } from './components/entity-reference-select'
import {
  materialLotProjectedItem,
  RepeatableItemsSection,
} from './components/repeatable-items-section'

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
  dimensional_form?: 'sheet' | 'ribbon' | 'tube' | 'rod' | 'particle'
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
  heating_channel?: string
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
  dimensional_form: 'sheet',
}

const DEFAULT_TIMELINE = {
  segments: [
    {
      segment_key: 'growth',
      segment_type: 'growth',
      sequence: 1,
      start_s: 0,
      end_s: 1800,
    },
  ] satisfies Segment[],
  channels: [
    {
      channel_key: 'temperature.zone_1',
      channel_type: 'temperature',
      source_type: 'setpoint',
      unit: '℃',
      data_kind: 'interval_series',
      series: [{ start_s: 0, end_s: 1800, value: 750 }],
    },
    {
      channel_key: 'pressure',
      channel_type: 'pressure',
      source_type: 'measured',
      unit: 'Pa',
      data_kind: 'scalar',
      scalar_value: 101325,
    },
  ] satisfies Channel[],
}

const METHOD_CONDITIONS: Record<
  string,
  Array<{ key: string; label: string; type?: 'number' }>
> = {
  optical_microscopy: [
    { key: 'objective', label: '物镜' },
    { key: 'illumination_mode', label: '照明模式' },
  ],
  Raman: [
    { key: 'laser_wavelength_nm', label: '激光波长 (nm)', type: 'number' },
    { key: 'power_setting', label: '功率设置' },
    { key: 'objective', label: '物镜' },
    { key: 'integration_time_s', label: '积分时间 (s)', type: 'number' },
    { key: 'accumulations', label: '累加次数', type: 'number' },
  ],
  low_frequency_raman: [
    { key: 'laser_wavelength_nm', label: '激光波长 (nm)', type: 'number' },
    { key: 'power_setting', label: '功率设置' },
    { key: 'objective', label: '物镜' },
    { key: 'integration_time_s', label: '积分时间 (s)', type: 'number' },
    { key: 'accumulations', label: '累加次数', type: 'number' },
  ],
  PL: [
    {
      key: 'excitation_wavelength_nm',
      label: '激发波长 (nm)',
      type: 'number',
    },
    { key: 'power_setting', label: '功率设置' },
    { key: 'integration_time_s', label: '积分时间 (s)', type: 'number' },
    { key: 'spectral_range_nm', label: '光谱范围 (nm)', type: 'number' },
    { key: 'temperature_K', label: '测量温度 (K)', type: 'number' },
  ],
  AFM: [
    { key: 'mode', label: '模式' },
    { key: 'probe', label: '探针' },
    { key: 'scan_size_um', label: '扫描尺寸 (μm)', type: 'number' },
    { key: 'resolution_px', label: '分辨率 (px)', type: 'number' },
    { key: 'scan_rate_hz', label: '扫描速率 (Hz)', type: 'number' },
  ],
  SEM: [
    {
      key: 'accelerating_voltage_kV',
      label: '加速电压 (kV)',
      type: 'number',
    },
    {
      key: 'working_distance_mm',
      label: '工作距离 (mm)',
      type: 'number',
    },
    { key: 'detector', label: '探测器' },
    { key: 'field_of_view_um', label: '视场 (μm)', type: 'number' },
  ],
  XRD: [
    { key: 'radiation_source', label: '辐射源' },
    {
      key: 'scan_range_2theta_deg',
      label: '2θ 扫描范围',
      type: 'number',
    },
    { key: 'step_size_deg', label: '步长 (°)', type: 'number' },
    { key: 'scan_rate_deg_min', label: '扫描速率 (°/min)', type: 'number' },
    { key: 'geometry', label: '几何构型' },
  ],
  TEM: [
    {
      key: 'accelerating_voltage_kV',
      label: '加速电压 (kV)',
      type: 'number',
    },
    { key: 'mode', label: '模式' },
    { key: 'sample_preparation', label: '样品制备' },
  ],
}

const PROPERTY_UNITS: Record<string, string> = {
  coverage_percent: '%',
  domain_size_um: 'μm',
  layer_count: 'count',
  nucleation_density_cm2: 'cm⁻²',
  raman_a1g_peak_position: 'cm⁻¹',
  raman_e2g_peak_position: 'cm⁻¹',
  raman_peak_separation: 'cm⁻¹',
  pl_a_exciton_peak_energy: 'eV',
  pl_b_exciton_peak_energy: 'eV',
  afm_rms_roughness: 'nm',
  afm_step_height: 'nm',
}

function numberOrUndefined(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value)
}

function modulePayload<T>(
  modules: Record<string, V2ModulePayloadRead | null> | undefined,
  key: string,
  fallback: T,
): T {
  return (modules?.[key]?.payload_json as T | undefined) ?? fallback
}

function SaveState({ save }: { save: ModuleSaveProps }) {
  return (
    <Button
      type="button"
      size="sm"
      disabled={save.saving}
      onClick={save.onSave}
    >
      {save.saving ? '保存中…' : save.saved ? '已保存' : '保存本节'}
    </Button>
  )
}

export function ScientificExperimentForm({
  mode,
  runId,
  runCode,
  initialState,
  modules,
  processReadOnly = false,
  resultsReadOnly = false,
  onProcessDirtyChange,
  onDirtyChange,
}: {
  mode: 'new' | 'edit'
  runId?: string
  runCode?: string
  initialState: ExperimentV2FormState
  modules?: Record<string, V2ModulePayloadRead | null>
  processReadOnly?: boolean
  resultsReadOnly?: boolean
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

  const [startedAt, setStartedAt] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16),
  )
  const [formula, setFormula] = useState('')
  const [objective, setObjective] = useState('')
  const [temperature, setTemperature] = useState('25')
  const [humidity, setHumidity] = useState('45')
  const [precheck, setPrecheck] = useState(false)

  const [target, setTarget] = useState<TargetSpec>(() =>
    modulePayload(modules, 'target_product', DEFAULT_TARGET),
  )
  const [loads, setLoads] = useState<SourceLoad[]>(
    () =>
      modulePayload<{ items: SourceLoad[] }>(modules, 'precursors', {
        items: [],
      }).items,
  )
  const [segments, setSegments] = useState<Segment[]>(
    () => modulePayload(modules, 'process_steps', DEFAULT_TIMELINE).segments,
  )
  const [channels, setChannels] = useState<Channel[]>(
    () => modulePayload(modules, 'process_steps', DEFAULT_TIMELINE).channels,
  )
  const [events, setEvents] = useState<ProcessEvent[]>(
    () =>
      modulePayload<{ items: ProcessEvent[] }>(modules, 'process_events', {
        items: [],
      }).items,
  )
  const [substrates, setSubstrates] = useState(initialState.substrates)
  const [equipment, setEquipment] = useState(initialState.equipment)

  const markDirty = (key: string) => {
    const next = new Set(dirty).add(key)
    setDirty(next)
    setSaved((current) => {
      const updated = new Set(current)
      updated.delete(key)
      return updated
    })
    onProcessDirtyChange?.(next.size > 0)
    onDirtyChange?.(next.size > 0)
  }

  const clearDirty = (key: string) => {
    const next = new Set(dirty)
    next.delete(key)
    setDirty(next)
    setSaved((current) => new Set(current).add(key))
    onProcessDirtyChange?.(next.size > 0)
    onDirtyChange?.(next.size > 0)
  }

  const save = async (key: string, payload: Record<string, unknown>) => {
    if (!runId) return
    setSavingKey(key)
    setErrors((current) => ({ ...current, [key]: '' }))
    try {
      if (key === 'equipment') {
        const [resetCount, useNumber] = equipment.tubeUsageHistory
          .split(',')
          .map(Number)
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
      toast.success('本节已保存')
    } catch (error) {
      const message = resolveErrorMessage(error, '保存失败，请检查本节字段')
      setErrors((current) => ({ ...current, [key]: message }))
      toast.error(message)
    } finally {
      setSavingKey(null)
    }
  }

  const saveProps = (
    key: string,
    payload: Record<string, unknown>,
  ): ModuleSaveProps => ({
    onSave: () => void save(key, payload),
    saving: savingKey === key,
    saved: saved.has(key),
    error: errors[key] || null,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      createRun(
        {
          started_at: new Date(startedAt).toISOString(),
          synthesis_method: 'CVD',
          ambient_temperature_C: Number(temperature),
          ambient_humidity_percent: Number(humidity),
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
          <CardTitle>创建 CVD 炉次</CardTitle>
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
              常压/低压、等离子体和源类型在过程事实中记录。
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scientific-formula">首个目标区域化学式</Label>
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
          <div className="grid gap-2">
            <Label htmlFor="scientific-temperature">室温 (℃)</Label>
            <Input
              id="scientific-temperature"
              type="number"
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="scientific-humidity">相对湿度 (%)</Label>
            <Input
              id="scientific-humidity"
              type="number"
              min="0"
              max="100"
              value={humidity}
              onChange={(event) => setHumidity(event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={precheck}
              onChange={(event) => setPrecheck(event.target.checked)}
            />
            已按当前检查清单完成炉次前检查
          </label>
          <div className="sm:col-span-2">
            <Button
              type="button"
              disabled={!startedAt || !precheck || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              创建并继续填写科学记录
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const setupZoneCount = Number(equipment.snapshot?.['zone_count']) || null

  return (
    <div className="grid gap-6">
      <ModuleCard id="module-basic_info" index="§1" title="炉次身份与参与者">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label>炉次编号</Label>
            <Input value={runCode ?? ''} readOnly />
          </div>
          <div>
            <Label>合成方法</Label>
            <Input value="CVD" readOnly />
          </div>
          <div>
            <Label>当前记录人</Label>
            <Input value={session.currentUser?.name ?? ''} readOnly />
          </div>
        </div>
      </ModuleCard>

      <TargetEditor
        target={target}
        disabled={processReadOnly}
        onChange={(value) => {
          setTarget(value)
          markDirty('target_product')
        }}
        save={saveProps('target_product', target)}
      />

      <ModuleCard id="module-equipment" index="§2" title="装置版本">
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem_auto]">
          <div className="grid gap-2">
            <Label>装置</Label>
            <EntityReferenceSelect
              kind="setup"
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
            <Label htmlFor="tube-usage">炉管重置次数, 本次序号</Label>
            <Input
              id="tube-usage"
              value={equipment.tubeUsageHistory}
              placeholder="0,1"
              disabled={processReadOnly}
              onChange={(event) => {
                setEquipment({
                  ...equipment,
                  tubeUsageHistory: event.target.value,
                })
                markDirty('equipment')
              }}
            />
          </div>
          <div className="self-end">
            <SaveState save={saveProps('equipment', {})} />
          </div>
        </div>
      </ModuleCard>

      <SourceLoadsEditor
        loads={loads}
        disabled={processReadOnly}
        token={token}
        onChange={(value) => {
          setLoads(value)
          markDirty('precursors')
        }}
        save={saveProps('precursors', { items: loads })}
      />

      <RepeatableItemsSection
        moduleKey="substrates"
        index="§4"
        title="衬底片与堆叠"
        addLabel="添加衬底片"
        emptyHint="至少添加一片衬底；锁定后每片衬底生成一个实际状态未知的样品。"
        itemLabel={(position) => `衬底片 ${position}`}
        items={substrates}
        onItemsChange={(items) => {
          setSubstrates(items)
          markDirty('substrates')
        }}
        disabled={processReadOnly}
        save={saveProps(
          'substrates',
          buildItemsModulePayload(
            'substrates',
            substrates.map((item) =>
              materialLotProjectedItem('substrates', item),
            ),
          ),
        )}
        zoneCount={setupZoneCount}
      />

      <TimelineEditor
        runId={runId ?? ''}
        token={token}
        segments={segments}
        channels={channels}
        disabled={processReadOnly}
        onChange={(nextSegments, nextChannels) => {
          setSegments(nextSegments)
          setChannels(nextChannels)
          markDirty('process_steps')
        }}
        save={saveProps('process_steps', { segments, channels })}
      />

      <EventsEditor
        events={events}
        disabled={processReadOnly}
        onChange={(value) => {
          setEvents(value)
          markDirty('process_events')
        }}
        save={saveProps('process_events', { items: events })}
      />

      {runId ? (
        <ScientificMeasurements
          runId={runId}
          token={token}
          readOnly={resultsReadOnly}
        />
      ) : null}
    </div>
  )
}

function TargetEditor({
  target,
  onChange,
  disabled,
  save,
}: {
  target: TargetSpec
  onChange: (value: TargetSpec) => void
  disabled: boolean
  save: ModuleSaveProps
}) {
  const setRegion = (index: number, patch: Partial<Region>) =>
    onChange({
      ...target,
      material_regions: target.material_regions.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    })
  return (
    <ModuleCard
      id="module-target_product"
      index="§1b"
      title="目标规格（研究意图，不等于实际样品）"
      onSave={save.onSave}
      saving={save.saving}
      saved={save.saved}
      error={save.error}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label>空间架构</Label>
          <Select
            value={target.architecture_type}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({
                ...target,
                architecture_type: value as TargetSpec['architecture_type'],
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single_region">单一区域</SelectItem>
              <SelectItem value="vertical_stack">垂直堆叠</SelectItem>
              <SelectItem value="lateral_junction">横向结</SelectItem>
              <SelectItem value="mixed_architecture">混合架构</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>维度形态</Label>
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sheet">片/膜</SelectItem>
              <SelectItem value="ribbon">带</SelectItem>
              <SelectItem value="tube">管</SelectItem>
              <SelectItem value="rod">棒</SelectItem>
              <SelectItem value="particle">颗粒</SelectItem>
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
            <SelectTrigger>
              <SelectValue placeholder="未设定" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="isolated">孤立区域</SelectItem>
              <SelectItem value="discontinuous">不连续</SelectItem>
              <SelectItem value="percolated">贯通</SelectItem>
              <SelectItem value="continuous">连续</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">目标材料区域</p>
            <p className="text-xs text-muted-foreground">
              每层或每个横向区域独立记录；化学组成关系在下方另行表达。
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
                    region_key: `region_${target.material_regions.length + 1}`,
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
            <Plus /> 添加区域
          </Button>
        </div>
        {target.material_regions.map((region, index) => (
          <div
            key={`${region.region_key}-${index}`}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6"
          >
            <Input
              aria-label="区域键"
              value={region.region_key}
              disabled={disabled}
              onChange={(event) =>
                setRegion(index, { region_key: event.target.value })
              }
              placeholder="region_1"
            />
            <Input
              aria-label="化学式"
              value={region.formula}
              disabled={disabled}
              onChange={(event) =>
                setRegion(index, { formula: event.target.value })
              }
              placeholder="MoS2"
            />
            <Select
              value={region.spatial_role}
              disabled={disabled}
              onValueChange={(value) =>
                setRegion(index, {
                  spatial_role: value as Region['spatial_role'],
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single_region">单一区域</SelectItem>
                <SelectItem value="layer">层</SelectItem>
                <SelectItem value="lateral_region">横向区域</SelectItem>
                <SelectItem value="mixed_region">混合区域</SelectItem>
              </SelectContent>
            </Select>
            <Input
              aria-label="层序"
              type="number"
              min="1"
              value={region.layer_index ?? ''}
              disabled={disabled}
              onChange={(event) =>
                setRegion(index, {
                  layer_index: numberOrUndefined(event.target.value),
                })
              }
              placeholder="层序"
            />
            <Input
              aria-label="横向区域名"
              value={region.lateral_region ?? ''}
              disabled={disabled}
              onChange={(event) =>
                setRegion(index, { lateral_region: event.target.value })
              }
              placeholder="横向区域名"
            />
            <div className="flex gap-2">
              <Input
                aria-label="目标层数"
                type="number"
                min="1"
                value={region.target_layer_count ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  setRegion(index, {
                    target_layer_count: numberOrUndefined(event.target.value),
                  })
                }
                placeholder="目标层数"
              />
              <Button
                type="button"
                size="icon"
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
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="font-medium">组成关系</p>
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
            <Plus /> 添加掺杂/合金关系
          </Button>
        </div>
        {target.composition_relations.map((relation, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6"
          >
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="doped_by">掺杂</SelectItem>
                <SelectItem value="substitutional_alloy">取代合金</SelectItem>
                <SelectItem value="intercalated_by">插层</SelectItem>
                <SelectItem value="decorated_by">表面修饰</SelectItem>
              </SelectContent>
            </Select>
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {target.material_regions.map((region) => (
                  <SelectItem key={region.region_key} value={region.region_key}>
                    {region.region_key}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={relation.species}
              disabled={disabled}
              placeholder="物种，如 Pt"
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
            <Input
              type="number"
              value={relation.nominal_value ?? ''}
              disabled={disabled}
              placeholder="标称值"
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unspecified">未给数值</SelectItem>
                <SelectItem value="at_percent">at%</SelectItem>
                <SelectItem value="mol_fraction">摩尔分数</SelectItem>
                <SelectItem value="site_fraction">位点分数</SelectItem>
                <SelectItem value="ratio">比值</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
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

function SourceLoadsEditor({
  loads,
  onChange,
  disabled,
  token,
  save,
}: {
  loads: SourceLoad[]
  onChange: (value: SourceLoad[]) => void
  disabled: boolean
  token: string
  save: ModuleSaveProps
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
    <ModuleCard
      id="module-precursors"
      index="§3"
      title="物理装料与源位"
      onSave={save.onSave}
      saving={save.saving}
      saved={save.saved}
      error={save.error}
    >
      <p className="text-sm text-muted-foreground">
        同一舟中共同研磨或混合的物料放在一个装料内；同一批次放在两个舟中则建两个装料。
      </p>
      {loads.map((load, loadIndex) => (
        <div key={loadIndex} className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-3 sm:grid-cols-6">
            <Input
              value={load.load_key}
              disabled={disabled}
              placeholder="装料键，如 metal_source"
              onChange={(event) =>
                patchLoad(loadIndex, { load_key: event.target.value })
              }
            />
            <Select
              value={load.loading_method}
              disabled={disabled}
              onValueChange={(value) =>
                patchLoad(loadIndex, { loading_method: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  'boat',
                  'crucible',
                  'substrate_surface',
                  'gas_line',
                  'bubbler',
                  'other',
                ].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={load.container_instance_id ?? 'none'}
              disabled={disabled || containers.isLoading}
              onValueChange={(value) =>
                patchLoad(loadIndex, {
                  container_instance_id: value === 'none' ? undefined : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="容器实例（可选）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未引用容器实例</SelectItem>
                {(containers.data ?? [])
                  .filter((container) =>
                    load.ingredients.some(
                      (item) =>
                        item.material_lot_id === container.material_lot_id,
                    ),
                  )
                  .map((container) => (
                    <SelectItem key={container.id} value={container.id}>
                      {container.container_code} · {container.status}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={load.initial_position?.axial_mm ?? ''}
              disabled={disabled}
              placeholder="初始轴向位置 (mm)"
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
            <Input
              value={load.heating_channel ?? ''}
              disabled={disabled}
              placeholder="加热通道（可选）"
              onChange={(event) =>
                patchLoad(loadIndex, {
                  heating_channel: event.target.value || undefined,
                })
              }
            />
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() =>
                onChange(loads.filter((_, current) => current !== loadIndex))
              }
            >
              <Trash2 /> 删除装料
            </Button>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>源位置程序</Label>
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
                className="grid grid-cols-[1fr_1fr_auto] gap-2"
              >
                <Input
                  type="number"
                  value={point.t_s}
                  disabled={disabled}
                  placeholder="t (s)"
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
                <Input
                  type="number"
                  value={point.axial_mm}
                  disabled={disabled}
                  placeholder="轴向位置 (mm)"
                  onChange={(event) =>
                    patchLoad(loadIndex, {
                      position_program: load.position_program.map(
                        (item, current) =>
                          current === pointIndex
                            ? { ...item, axial_mm: Number(event.target.value) }
                            : item,
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    patchLoad(loadIndex, {
                      position_program: load.position_program.filter(
                        (_, current) => current !== pointIndex,
                      ),
                    })
                  }
                >
                  <Trash2 />
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
                <Input
                  value={step.step_type}
                  disabled={disabled}
                  onChange={(event) =>
                    patchLoad(loadIndex, {
                      preparation_steps: load.preparation_steps.map(
                        (item, current) =>
                          current === stepIndex
                            ? { ...item, step_type: event.target.value }
                            : item,
                      ),
                    })
                  }
                />
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
              <div key={ingredientIndex} className="grid gap-3 sm:grid-cols-5">
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={ingredient.amount ?? ''}
                  disabled={disabled}
                  placeholder="用量"
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
                <Input
                  value={ingredient.unit ?? ''}
                  disabled={disabled}
                  placeholder="单位，如 mg"
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
                <Button
                  type="button"
                  variant="ghost"
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
              load_key: `source_${loads.length + 1}`,
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
        <Plus /> 添加物理装料
      </Button>
    </ModuleCard>
  )
}

function TimelineEditor({
  runId,
  token,
  segments,
  channels,
  onChange,
  disabled,
  save,
}: {
  runId: string
  token: string
  segments: Segment[]
  channels: Channel[]
  onChange: (segments: Segment[], channels: Channel[]) => void
  disabled: boolean
  save: ModuleSaveProps
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
  const uploadSeries = async (index: number, file: File) => {
    const channel = channels[index]
    try {
      const uploaded = await uploadExperimentFile(token, runId, {
        file,
        assetRole:
          channel.channel_type === 'temperature'
            ? 'temperature_timeseries'
            : 'process_timeseries',
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
    <ModuleCard
      id="module-process_steps"
      index="§5"
      title="统一过程时间轴"
      onSave={save.onSave}
      saving={save.saving}
      saved={save.saved}
      error={save.error}
    >
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">过程分段</p>
            <p className="text-xs text-muted-foreground">
              分段只描述时间范围；温度、流量、压力、阀门和源移动都作为独立通道。
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
                    segment_key: `segment_${segments.length + 1}`,
                    segment_type: 'other',
                    sequence: segments.length + 1,
                    start_s: segments.at(-1)?.end_s ?? 0,
                    end_s: (segments.at(-1)?.end_s ?? 0) + 60,
                  },
                ],
                channels,
              )
            }
          >
            <Plus /> 添加分段
          </Button>
        </div>
        {segments.map((segment, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6"
          >
            <Input
              value={segment.segment_key}
              disabled={disabled}
              onChange={(event) =>
                patchSegment(index, { segment_key: event.target.value })
              }
            />
            <Select
              value={segment.segment_type}
              disabled={disabled}
              onValueChange={(value) =>
                patchSegment(index, { segment_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={segment.start_s}
              disabled={disabled}
              onChange={(event) =>
                patchSegment(index, { start_s: Number(event.target.value) })
              }
              placeholder="开始 s"
            />
            <Input
              type="number"
              value={segment.end_s}
              disabled={disabled}
              onChange={(event) =>
                patchSegment(index, { end_s: Number(event.target.value) })
              }
              placeholder="结束 s"
            />
            <Input
              value={segment.label ?? ''}
              disabled={disabled}
              onChange={(event) =>
                patchSegment(index, { label: event.target.value })
              }
              placeholder="显示名称"
            />
            <Button
              type="button"
              variant="ghost"
              disabled={disabled || segments.length === 1}
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
        ))}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <p className="font-medium">过程通道</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onChange(segments, [
                ...channels,
                {
                  channel_key: `channel_${channels.length + 1}`,
                  channel_type: 'flow',
                  source_type: 'setpoint',
                  unit: 'sccm',
                  data_kind: 'scalar',
                  scalar_value: 0,
                },
              ])
            }
          >
            <Plus /> 添加通道
          </Button>
        </div>
        {channels.map((channel, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-7"
          >
            <Input
              value={channel.channel_key}
              disabled={disabled}
              onChange={(event) =>
                patchChannel(index, { channel_key: event.target.value })
              }
              placeholder="flow.ar"
            />
            <Select
              value={channel.channel_type}
              disabled={disabled}
              onValueChange={(value) =>
                patchChannel(index, { channel_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  'temperature',
                  'flow',
                  'pressure',
                  'valve_state',
                  'source_position',
                  'furnace_position',
                  'plasma_power',
                  'shutter_state',
                ].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={channel.source_type}
              disabled={disabled}
              onValueChange={(value) =>
                patchChannel(index, { source_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="setpoint">设定值</SelectItem>
                <SelectItem value="measured">实测值</SelectItem>
                <SelectItem value="inferred">推断值</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={channel.unit}
              disabled={disabled}
              onChange={(event) =>
                patchChannel(index, { unit: event.target.value })
              }
              placeholder="单位"
            />
            <Select
              value={channel.data_kind}
              disabled={disabled}
              onValueChange={(value) =>
                patchChannel(index, {
                  data_kind: value as Channel['data_kind'],
                  scalar_value: value === 'scalar' ? 0 : undefined,
                  series:
                    value === 'interval_series'
                      ? [{ start_s: 0, end_s: 60, value: 0 }]
                      : undefined,
                  file_asset_id: undefined,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scalar">单值</SelectItem>
                <SelectItem value="interval_series">区间序列</SelectItem>
                <SelectItem value="timeseries_file">时间序列文件</SelectItem>
              </SelectContent>
            </Select>
            {channel.data_kind === 'scalar' ? (
              <Input
                type="number"
                value={channel.scalar_value ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  patchChannel(index, {
                    scalar_value: Number(event.target.value),
                  })
                }
              />
            ) : channel.data_kind === 'interval_series' ? (
              <div className="grid gap-1">
                {(channel.series ?? []).map((point, pointIndex) => (
                  <div
                    key={pointIndex}
                    className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1"
                  >
                    {(
                      [
                        ['start_s', '开始秒'],
                        ['end_s', '结束秒'],
                        ['value', '通道值'],
                      ] as const
                    ).map(([key, label]) => (
                      <Input
                        key={key}
                        aria-label={label}
                        type={
                          typeof point.value === 'number' ? 'number' : 'text'
                        }
                        value={point[key] ?? ''}
                        disabled={disabled}
                        onChange={(event) =>
                          patchChannel(index, {
                            series: (channel.series ?? []).map(
                              (item, current) =>
                                current === pointIndex
                                  ? {
                                      ...item,
                                      [key]:
                                        key === 'value' &&
                                        typeof item.value === 'string'
                                          ? event.target.value
                                          : numberOrUndefined(
                                              event.target.value,
                                            ),
                                    }
                                  : item,
                            ),
                          })
                        }
                      />
                    ))}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={disabled || channel.series?.length === 1}
                      onClick={() =>
                        patchChannel(index, {
                          series: channel.series?.filter(
                            (_, current) => current !== pointIndex,
                          ),
                        })
                      }
                    >
                      <Trash2 />
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
                          value: channel.series?.at(-1)?.value ?? 0,
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
                  className="sr-only"
                  disabled={disabled}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadSeries(index, file)
                  }}
                />
              </label>
            )}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={disabled}
              onClick={() =>
                onChange(
                  segments,
                  channels.filter((_, current) => current !== index),
                )
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </ModuleCard>
  )
}

function EventsEditor({
  events,
  onChange,
  disabled,
  save,
}: {
  events: ProcessEvent[]
  onChange: (events: ProcessEvent[]) => void
  disabled: boolean
  save: ModuleSaveProps
}) {
  const patch = (index: number, patchValue: Partial<ProcessEvent>) =>
    onChange(
      events.map((item, current) =>
        current === index ? { ...item, ...patchValue } : item,
      ),
    )
  return (
    <ModuleCard
      id="module-process_events"
      index="§6"
      title="异常、干预与数据有效性"
      onSave={save.onSave}
      saving={save.saving}
      saved={save.saved}
      error={save.error}
    >
      {events.map((event, index) => (
        <div
          key={index}
          className="grid gap-3 rounded-lg border p-3 sm:grid-cols-6"
        >
          <Input
            value={event.event_key}
            disabled={disabled}
            onChange={(input) =>
              patch(index, { event_key: input.target.value })
            }
            placeholder="gas_interruption_1"
          />
          <Input
            type="number"
            value={event.start_s}
            disabled={disabled}
            onChange={(input) =>
              patch(index, { start_s: Number(input.target.value) })
            }
            placeholder="开始 s"
          />
          <Input
            type="number"
            value={event.end_s ?? ''}
            disabled={disabled}
            onChange={(input) =>
              patch(index, { end_s: numberOrUndefined(input.target.value) })
            }
            placeholder="结束 s"
          />
          <Input
            value={event.observed_deviations.join('；')}
            disabled={disabled}
            onChange={(input) =>
              patch(index, {
                observed_deviations: input.target.value
                  .split('；')
                  .filter(Boolean),
              })
            }
            placeholder="观察到的偏差"
          />
          <Select
            value={event.data_validity_impact ?? 'unknown'}
            disabled={disabled}
            onValueChange={(value) =>
              patch(index, { data_validity_impact: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">不影响</SelectItem>
              <SelectItem value="partial">部分影响</SelectItem>
              <SelectItem value="invalid">数据无效</SelectItem>
              <SelectItem value="unknown">未知</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              onChange(events.filter((_, current) => current !== index))
            }
          >
            <Trash2 /> 删除
          </Button>
          <Textarea
            className="sm:col-span-2"
            value={event.description ?? ''}
            disabled={disabled}
            onChange={(input) =>
              patch(index, { description: input.target.value })
            }
            placeholder="事件客观描述"
          />
          {(
            [
              ['intervention_actions', '干预动作（；分隔）'],
              ['affected_objects', '受影响对象（；分隔）'],
              ['suspected_causes', '怀疑原因（；分隔）'],
            ] as const
          ).map(([key, placeholder]) => (
            <Textarea
              key={key}
              value={event[key].join('；')}
              disabled={disabled}
              onChange={(input) =>
                patch(index, {
                  [key]: input.target.value.split('；').filter(Boolean),
                })
              }
              placeholder={placeholder}
            />
          ))}
          <Textarea
            value={event.outcome ?? ''}
            disabled={disabled}
            onChange={(input) => patch(index, { outcome: input.target.value })}
            placeholder="事件结果"
          />
          <div className="grid gap-2 sm:col-span-6">
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
                className="grid grid-cols-[1fr_1fr_auto] gap-2"
              >
                {(['start_s', 'end_s'] as const).map((key) => (
                  <Input
                    key={key}
                    type="number"
                    value={range[key]}
                    disabled={disabled}
                    aria-label={key === 'start_s' ? '排除开始秒' : '排除结束秒'}
                    onChange={(input) =>
                      patch(index, {
                        excluded_time_ranges: event.excluded_time_ranges.map(
                          (item, current) =>
                            current === rangeIndex
                              ? { ...item, [key]: Number(input.target.value) }
                              : item,
                        ),
                      })
                    }
                  />
                ))}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    patch(index, {
                      excluded_time_ranges: event.excluded_time_ranges.filter(
                        (_, current) => current !== rangeIndex,
                      ),
                    })
                  }
                >
                  <Trash2 />
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
              event_key: `event_${events.length + 1}`,
              start_s: 0,
              observed_deviations: [''],
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

function ScientificMeasurements({
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
  const [method, setMethod] = useState('optical_microscopy')
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
    label: 'center',
    x: '0',
    y: '0',
    width: '100',
    height: '100',
    unit: 'μm',
  })
  const [propertyCode, setPropertyCode] = useState('')
  const [propertyValue, setPropertyValue] = useState('')
  const [growth, setGrowth] = useState('uncertain')
  const [software, setSoftware] = useState('')
  const [softwareVersion, setSoftwareVersion] = useState('')
  const [rawFiles, setRawFiles] = useState<File[]>([])

  const selectedSampleId = sampleId || samples.data?.items[0]?.id || ''
  const conditionFields = METHOD_CONDITIONS[method] ?? []
  const mutation = useMutation({
    mutationFn: async () => {
      const uploaded = await Promise.all(
        rawFiles.map((file) =>
          uploadExperimentFile(token, runId, {
            file,
            sampleId: selectedSampleId,
            method,
            assetRole: 'characterization_file',
          }),
        ),
      )
      const typedConditions = Object.fromEntries(
        conditionFields.map((field) => [
          field.key,
          field.type === 'number'
            ? Number(conditions[field.key])
            : conditions[field.key],
        ]),
      )
      const properties =
        propertyCode && propertyValue !== ''
          ? [
              {
                property_code: propertyCode,
                numeric_value: Number(propertyValue),
                unit: PROPERTY_UNITS[propertyCode],
                statistic: 'single_observation',
                analysis_index: software ? 0 : undefined,
              },
            ]
          : []
      return createMeasurement(
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
              geometry_type: 'area',
              label: region.label,
              coordinate_system: 'sample_local',
              x: Number(region.x),
              y: Number(region.y),
              width: Number(region.width),
              height: Number(region.height),
              unit: region.unit,
            },
            typed_conditions: typedConditions,
            raw_file_ids: uploaded.map((file) => file.id),
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
                  input_file_ids: uploaded.map((file) => file.id),
                  output_file_ids: [],
                },
              ]
            : [],
          properties,
          assertions: [
            {
              assertion_type: 'growth_presence',
              value: { state: growth },
              confidence: null,
              analysis_index: software ? 0 : undefined,
            },
          ],
        },
        token,
      )
    },
    onSuccess: async () => {
      setPropertyValue('')
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
    <ModuleCard id="module-results" index="§7" title="测量、分析与事实声明">
      <div className="grid gap-4 rounded-lg border p-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="grid gap-2">
            <Label>样品</Label>
            <Select value={selectedSampleId} onValueChange={setSampleId}>
              <SelectTrigger>
                <SelectValue placeholder="选择样品" />
              </SelectTrigger>
              <SelectContent>
                {(samples.data?.items ?? []).map((sample) => (
                  <SelectItem key={sample.id} value={sample.id}>
                    {sample.sample_code} · 实际状态 {sample.actual_state}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>方法配置</Label>
            <Select
              value={method}
              onValueChange={(value) => {
                setMethod(value)
                setConditions({})
                setInstrumentId('')
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(METHOD_CONDITIONS).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>测量时间</Label>
            <Input
              type="datetime-local"
              value={measuredAt}
              onChange={(event) => setMeasuredAt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>原始文件</Label>
            <Input
              type="file"
              multiple
              onChange={(event) =>
                setRawFiles(Array.from(event.target.files ?? []))
              }
            />
          </div>
        </div>

        {method !== 'optical_microscopy' ? (
          <div className="grid gap-2">
            <Label>仪器版本（能力必须支持所选方法）</Label>
            <EntityReferenceSelect
              kind="instrument"
              value={instrumentId}
              selectedVersion={instrumentVersion}
              selectedSnapshot={instrumentSnapshot}
              onChange={(id, entity) => {
                setInstrumentId(id)
                setInstrumentVersion(entity?.latest_version?.version ?? null)
                setInstrumentSnapshot(entity?.latest_version?.data ?? null)
              }}
            />
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          {conditionFields.map((field) => (
            <div key={field.key} className="grid gap-2">
              <Label>{field.label}</Label>
              <Input
                type={field.type ?? 'text'}
                value={conditions[field.key] ?? ''}
                onChange={(event) =>
                  setConditions({
                    ...conditions,
                    [field.key]: event.target.value,
                  })
                }
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-6">
          {Object.entries(region).map(([key, value]) => (
            <div key={key} className="grid gap-2">
              <Label>{key}</Label>
              <Input
                type={
                  ['x', 'y', 'width', 'height'].includes(key)
                    ? 'number'
                    : 'text'
                }
                value={value}
                onChange={(event) =>
                  setRegion({ ...region, [key]: event.target.value })
                }
              />
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <div className="grid gap-2">
            <Label>生长事实声明</Label>
            <Select value={growth} onValueChange={setGrowth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="present">观察到生长</SelectItem>
                <SelectItem value="absent">无生长</SelectItem>
                <SelectItem value="uncertain">不确定</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>结构化属性（可选）</Label>
            <Select
              value={propertyCode || 'none'}
              onValueChange={(value) =>
                setPropertyCode(value === 'none' ? '' : value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">不记录数值属性</SelectItem>
                {Object.entries(PROPERTY_UNITS).map(([code, unit]) => (
                  <SelectItem key={code} value={code}>
                    {code} ({unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>属性值</Label>
            <Input
              type="number"
              value={propertyValue}
              disabled={!propertyCode}
              onChange={(event) => setPropertyValue(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>分析软件（可选）</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={software}
                placeholder="软件/脚本"
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

        <Button
          type="button"
          disabled={
            readOnly ||
            !selectedSampleId ||
            conditionFields.some((field) => !conditions[field.key]) ||
            (software !== '' && (!softwareVersion || rawFiles.length === 0)) ||
            mutation.isPending
          }
          onClick={() => mutation.mutate()}
        >
          保存 MeasurementRun → AnalysisRun → Property / Assertion
        </Button>
      </div>

      <div className="grid gap-2">
        {(measurements.data?.items ?? []).map((item) => (
          <div
            key={item.id}
            className="grid gap-2 rounded-lg border px-4 py-3 text-sm sm:grid-cols-6"
          >
            <span className="font-medium">{item.sample_code}</span>
            <span>{item.method_profile}</span>
            <span>{new Date(item.measured_at).toLocaleString()}</span>
            <span>原始文件 {item.raw_file_count}</span>
            <span>属性 {item.property_count}</span>
            <span>声明 {item.assertion_count}</span>
          </div>
        ))}
      </div>
    </ModuleCard>
  )
}
