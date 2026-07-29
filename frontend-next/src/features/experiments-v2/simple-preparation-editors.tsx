import { Fragment } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
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
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { gasSpecies } from '@/shared/generated/field-metadata'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { uploadExperimentFile } from '@/features/samples/api'

import type { ModuleValues } from './field-logic'
import { emptyModuleValues, moduleValueAsString } from './field-logic'
import { EntityReferenceSelect } from './components/entity-reference-select'
import { materialLotProjection } from './components/repeatable-items-section'
import { ModuleCard } from './components/module-card'
import {
  buildEventDescription,
  compositionValueForDisplay,
  compositionValueForPayload,
  splitEventDescription,
} from './simple-form-adapters'

export type SimpleRegion = {
  region_key: string
  formula: string
  spatial_role: 'single_region' | 'layer' | 'lateral_region' | 'mixed_region'
  layer_index?: number
  lateral_region?: string
  target_layer_count?: number
}

export type SimpleCompositionRelation = {
  relation_type: 'doped_by' | 'substitutional_alloy'
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

export type SimpleTarget = {
  architecture_type:
    | 'single_region'
    | 'vertical_stack'
    | 'lateral_junction'
    | 'mixed_architecture'
  material_regions: SimpleRegion[]
  composition_relations: SimpleCompositionRelation[]
  dimensional_form?:
    | 'sheet'
    | 'ribbon'
    | 'wire'
    | 'tube'
    | 'rod'
    | 'particle'
    | 'other'
  coverage_state?: 'isolated' | 'discontinuous' | 'percolated' | 'continuous'
  optimization_objective?: string
}

export type SimpleIngredient = {
  material_lot_id: string
  material_lot_version: number
  function_role: string
  amount?: number
  unit?: string
  snapshot?: Record<string, unknown>
}

export type SimpleSourceLoad = {
  load_key: string
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
  ingredients: SimpleIngredient[]
}

export type SimpleSegment = {
  segment_key: string
  segment_type: string
  sequence: number
  start_s: number
  end_s: number
}

export type SimpleChannel = {
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

export type SimpleProcessSettings = {
  pressure_regime?: 'atmospheric' | 'low_pressure' | 'other'
  cooling_method?: 'natural' | 'rapid_furnace_move' | 'controlled' | 'other'
  cooling_other?: string
  external_fields?: string[]
}

export type SimpleProcessEvent = {
  event_key: string
  start_s: number
  end_s?: number
  observed_deviations: string[]
  intervention_actions: string[]
  affected_objects: string[]
  suspected_causes: string[]
  data_validity_impact?: string
  outcome?: string
  excluded_time_ranges: Array<{ start_s: number; end_s: number }>
  description?: string
  attachment_file_ids: string[]
}

function key(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '_')}`
}

function number(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value)
}

type TargetKind = 'single' | 'doped' | 'alloy' | 'vertical' | 'lateral'

function targetKind(target: SimpleTarget): TargetKind {
  if (target.architecture_type === 'vertical_stack') return 'vertical'
  if (target.architecture_type === 'lateral_junction') return 'lateral'
  if (
    target.composition_relations[0]?.relation_type === 'substitutional_alloy'
  ) {
    return 'alloy'
  }
  return target.composition_relations[0]?.relation_type === 'doped_by'
    ? 'doped'
    : 'single'
}

function changeTargetKind(
  target: SimpleTarget,
  kindValue: TargetKind,
): SimpleTarget {
  const firstFormula = target.material_regions[0]?.formula ?? ''
  const singleRegion: SimpleRegion = {
    region_key: 'film',
    formula: firstFormula,
    spatial_role: 'single_region',
  }
  if (kindValue === 'single') {
    return {
      ...target,
      architecture_type: 'single_region',
      material_regions: [singleRegion],
      composition_relations: [],
    }
  }
  if (kindValue === 'doped' || kindValue === 'alloy') {
    return {
      ...target,
      architecture_type: 'single_region',
      material_regions: [singleRegion],
      composition_relations: [
        {
          relation_type:
            kindValue === 'doped' ? 'doped_by' : 'substitutional_alloy',
          host_region_key: 'film',
          species: '',
          value_basis: kindValue === 'alloy' ? 'site_fraction' : 'unspecified',
        },
      ],
    }
  }
  const vertical = kindValue === 'vertical'
  return {
    ...target,
    architecture_type: vertical ? 'vertical_stack' : 'lateral_junction',
    material_regions: [0, 1].map((index) => ({
      region_key: vertical ? `layer_${index + 1}` : `region_${index + 1}`,
      formula: index === 0 ? firstFormula : '',
      spatial_role: vertical ? 'layer' : 'lateral_region',
      ...(vertical
        ? { layer_index: index + 1 }
        : { lateral_region: String.fromCharCode(65 + index) }),
    })),
    composition_relations: [],
  }
}

export function SimpleTargetEditor({
  target,
  selected = true,
  onChange,
  disabled,
}: {
  target: SimpleTarget
  selected?: boolean
  onChange: (target: SimpleTarget) => void
  disabled: boolean
}) {
  const kindValue = targetKind(target)
  const relation = target.composition_relations[0]
  const setRegion = (index: number, patch: Partial<SimpleRegion>) =>
    onChange({
      ...target,
      material_regions: target.material_regions.map((region, current) =>
        current === index ? { ...region, ...patch } : region,
      ),
    })
  const setRelation = (patch: Partial<SimpleCompositionRelation>) =>
    onChange({
      ...target,
      composition_relations: relation ? [{ ...relation, ...patch }] : [],
    })

  return (
    <ModuleCard id="module-target_product" title="目标材料">
      <div className="flex flex-col gap-2">
        <Label>目标材料类型</Label>
        <Select
          value={
            !selected
              ? ''
              : kindValue === 'vertical' || kindValue === 'lateral'
                ? 'heterostructure'
                : kindValue
          }
          disabled={disabled}
          onValueChange={(value) =>
            onChange(
              changeTargetKind(
                target,
                value === 'heterostructure'
                  ? 'vertical'
                  : (value as TargetKind),
              ),
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="single">单一材料</SelectItem>
              <SelectItem value="doped">掺杂材料</SelectItem>
              <SelectItem value="alloy">合金</SelectItem>
              <SelectItem value="heterostructure">异质结构</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {selected && (kindValue === 'vertical' || kindValue === 'lateral') ? (
        <div className="flex flex-col gap-2">
          <Label>结构方式</Label>
          <Select
            value={kindValue}
            disabled={disabled}
            onValueChange={(value) =>
              onChange(changeTargetKind(target, value as TargetKind))
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="vertical">垂直异质结构</SelectItem>
                <SelectItem value="lateral">横向异质结构</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {selected ? (
        kindValue === 'single' ||
        kindValue === 'doped' ||
        kindValue === 'alloy' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>
                {kindValue === 'single'
                  ? '目标材料化学式'
                  : kindValue === 'doped'
                    ? '基体材料化学式'
                    : '基础材料化学式'}
              </Label>
              <Input
                value={target.material_regions[0]?.formula ?? ''}
                disabled={disabled}
                placeholder="例如 MoS2"
                onChange={(event) =>
                  setRegion(0, { formula: event.target.value })
                }
              />
            </div>
            {kindValue === 'single' ? (
              <div className="flex flex-col gap-2">
                <Label>目标形态</Label>
                <Select
                  value={
                    target.coverage_state === 'continuous'
                      ? 'continuous'
                      : (target.dimensional_form ?? '')
                  }
                  disabled={disabled}
                  onValueChange={(value) =>
                    onChange({
                      ...target,
                      dimensional_form:
                        value === 'continuous'
                          ? undefined
                          : (value as SimpleTarget['dimensional_form']),
                      coverage_state:
                        value === 'continuous' ? 'continuous' : undefined,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="sheet">纳米片</SelectItem>
                      <SelectItem value="ribbon">纳米带</SelectItem>
                      <SelectItem value="wire">纳米线</SelectItem>
                      <SelectItem value="tube">纳米管</SelectItem>
                      <SelectItem value="rod">纳米棒</SelectItem>
                      <SelectItem value="particle">颗粒</SelectItem>
                      <SelectItem value="continuous">连续膜</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {kindValue === 'doped' ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label>掺杂元素</Label>
                  <Input
                    value={relation?.species ?? ''}
                    disabled={disabled}
                    placeholder="例如 Pt"
                    onChange={(event) =>
                      setRelation({ species: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>目标含量</Label>
                  <Input
                    type="number"
                    value={compositionValueForDisplay(
                      relation?.nominal_value,
                      relation?.value_basis ?? 'unspecified',
                    )}
                    disabled={disabled}
                    placeholder="例如 1"
                    onChange={(event) =>
                      setRelation({
                        nominal_value: compositionValueForPayload(
                          event.target.value,
                          relation?.value_basis ?? 'at_percent',
                        ),
                        value_basis:
                          event.target.value.trim() === ''
                            ? 'unspecified'
                            : relation?.value_basis === 'unspecified'
                              ? 'at_percent'
                              : relation?.value_basis,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>含量单位</Label>
                  <Select
                    value={relation?.value_basis ?? 'unspecified'}
                    disabled={disabled || relation?.nominal_value === undefined}
                    onValueChange={(value) =>
                      setRelation({
                        value_basis:
                          value as SimpleCompositionRelation['value_basis'],
                        nominal_value: compositionValueForPayload(
                          compositionValueForDisplay(
                            relation?.nominal_value,
                            relation?.value_basis ?? 'unspecified',
                          ),
                          value,
                        ),
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="at_percent">at%</SelectItem>
                        <SelectItem value="mol_fraction">mol%</SelectItem>
                        <SelectItem value="site_fraction">位点分数</SelectItem>
                        <SelectItem value="ratio">质量分数</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>掺杂位点</Label>
                  <Input
                    value={relation?.site_or_location ?? ''}
                    disabled={disabled}
                    placeholder="例如 Mo 位点"
                    onChange={(event) =>
                      setRelation({ site_or_location: event.target.value })
                    }
                  />
                </div>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  填写示例：{relation?.species || 'Pt'} 掺杂{' '}
                  {target.material_regions[0]?.formula || 'MoS₂'}
                  {relation?.nominal_value === undefined
                    ? ''
                    : `，目标含量 ${compositionValueForDisplay(
                        relation.nominal_value,
                        relation.value_basis,
                      )} ${
                        {
                          at_percent: 'at%',
                          mol_fraction: 'mol%',
                          site_fraction: '位点分数',
                          ratio: '质量分数',
                          unspecified: '',
                        }[relation.value_basis]
                      }`}
                </p>
              </>
            ) : null}
            {kindValue === 'alloy' ? (
              <>
                <div className="flex flex-col gap-2">
                  <Label>取代元素</Label>
                  <Input
                    value={relation?.species ?? ''}
                    disabled={disabled}
                    placeholder="例如 W"
                    onChange={(event) =>
                      setRelation({ species: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>被取代位点</Label>
                  <Input
                    value={relation?.site_or_location ?? ''}
                    disabled={disabled}
                    placeholder="例如 Mo 位点"
                    onChange={(event) =>
                      setRelation({ site_or_location: event.target.value })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>目标位点分数</Label>
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="any"
                    value={relation?.nominal_value ?? ''}
                    disabled={disabled}
                    placeholder="例如 0.5"
                    onChange={(event) =>
                      setRelation({
                        nominal_value: number(event.target.value),
                        value_basis: 'site_fraction',
                      })
                    }
                  />
                </div>
                <p className="self-end text-sm text-muted-foreground">
                  示例：MoS₂ 中 W 取代 Mo，目标位点分数 0.5，对应常见写法
                  Mo₀.₅W₀.₅S₂。
                </p>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {target.material_regions.map((region, index) => (
              <div
                key={region.region_key}
                className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
              >
                <div className="flex items-center justify-between gap-3 sm:col-span-2">
                  <p className="font-medium">
                    {kindValue === 'vertical'
                      ? `第 ${index + 1} 层${index === 0 ? '（靠近衬底）' : ''}`
                      : `区域 ${String.fromCharCode(65 + index)}`}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled || target.material_regions.length <= 2}
                    onClick={() =>
                      onChange({
                        ...target,
                        material_regions: target.material_regions
                          .filter((_, current) => current !== index)
                          .map((item, current) => ({
                            ...item,
                            ...(kindValue === 'vertical'
                              ? { layer_index: current + 1 }
                              : {
                                  lateral_region: String.fromCharCode(
                                    65 + current,
                                  ),
                                }),
                          })),
                      })
                    }
                  >
                    <Trash2 data-icon="inline-start" />
                    删除
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>材料化学式</Label>
                  <Input
                    value={region.formula}
                    disabled={disabled}
                    placeholder="例如 MoS2"
                    onChange={(event) =>
                      setRegion(index, { formula: event.target.value })
                    }
                  />
                </div>
                {kindValue === 'vertical' ? (
                  <div className="flex flex-col gap-2">
                    <Label>目标层数</Label>
                    <Input
                      type="number"
                      min="1"
                      value={region.target_layer_count ?? ''}
                      disabled={disabled}
                      onChange={(event) =>
                        setRegion(index, {
                          target_layer_count: number(event.target.value),
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => {
                const index = target.material_regions.length
                onChange({
                  ...target,
                  material_regions: [
                    ...target.material_regions,
                    {
                      region_key: key(
                        kindValue === 'vertical' ? 'layer' : 'region',
                      ),
                      formula: '',
                      spatial_role:
                        kindValue === 'vertical' ? 'layer' : 'lateral_region',
                      ...(kindValue === 'vertical'
                        ? { layer_index: index + 1 }
                        : {
                            lateral_region: String.fromCharCode(65 + index),
                          }),
                    },
                  ],
                })
              }}
            >
              <Plus data-icon="inline-start" />
              {kindValue === 'vertical' ? '添加一层' : '添加区域'}
            </Button>
          </div>
        )
      ) : null}

      {selected ? (
        <div className="flex flex-col gap-2">
          <Label>目标性能或研究目的</Label>
          <Textarea
            value={target.optimization_objective ?? ''}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...target,
                optimization_objective: event.target.value,
              })
            }
          />
        </div>
      ) : null}
    </ModuleCard>
  )
}

function newIngredient(): SimpleIngredient {
  return {
    material_lot_id: '',
    material_lot_version: 0,
    function_role: '',
  }
}

function newLoad(): SimpleSourceLoad {
  return {
    load_key: key('load'),
    loading_method: '',
    preparation_steps: [],
    position_program: [],
    ingredients: [newIngredient()],
  }
}

export function SimpleSourceLoadsEditor({
  loads,
  zoneCount,
  disabled,
  onChange,
}: {
  loads: SimpleSourceLoad[]
  zoneCount: number | null
  disabled: boolean
  onChange: (loads: SimpleSourceLoad[]) => void
}) {
  const update = (index: number, load: SimpleSourceLoad) =>
    onChange(loads.map((item, current) => (current === index ? load : item)))

  return (
    <ModuleCard id="module-precursors" title="前驱体">
      <div className="flex flex-col gap-5">
        {loads.map((load, loadIndex) => (
          <div
            key={load.load_key}
            className="flex flex-col gap-4 rounded-lg border p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">前驱体容器 {loadIndex + 1}</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  onChange(loads.filter((_, current) => current !== loadIndex))
                }
              >
                <Trash2 data-icon="inline-start" />
                删除容器
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>装载容器</Label>
                <Select
                  value={load.loading_method}
                  disabled={disabled}
                  onValueChange={(value) =>
                    update(loadIndex, { ...load, loading_method: value })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="请选择" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="boat">舟</SelectItem>
                      <SelectItem value="crucible">坩埚</SelectItem>
                      <SelectItem value="substrate_surface">
                        衬底表面
                      </SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>对应加热温区</Label>
                <Select
                  value={load.heating_zone_ref ?? 'none'}
                  disabled={disabled}
                  onValueChange={(value) =>
                    update(loadIndex, {
                      ...load,
                      heating_zone_ref: value === 'none' ? undefined : value,
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">未填写</SelectItem>
                      {Array.from({ length: zoneCount ?? 0 }, (_, index) => (
                        <SelectItem key={index} value={`zone_${index + 1}`}>
                          温区 {index + 1}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>轴向位置（mm）</Label>
                <Input
                  type="number"
                  step="any"
                  value={load.initial_position?.axial_mm ?? ''}
                  disabled={disabled}
                  onChange={(event) =>
                    update(loadIndex, {
                      ...load,
                      initial_position:
                        event.target.value.trim() === ''
                          ? undefined
                          : {
                              axial_mm: Number(event.target.value),
                              reference: 'setup_origin',
                            },
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>处理方式</Label>
                <Select
                  value={load.preparation_steps[0]?.step_type ?? 'none'}
                  disabled={disabled}
                  onValueChange={(value) =>
                    update(loadIndex, {
                      ...load,
                      preparation_steps:
                        value === 'none'
                          ? []
                          : [
                              {
                                step_type: value,
                                sequence: 1,
                                parameters: {},
                              },
                            ],
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">未填写</SelectItem>
                      <SelectItem value="direct_load">直接装载</SelectItem>
                      <SelectItem value="grind">研磨</SelectItem>
                      <SelectItem value="mix">混合</SelectItem>
                      <SelectItem value="spin_coat">旋涂</SelectItem>
                      <SelectItem value="pre_anneal">预退火</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />
            <div className="flex flex-col gap-4">
              {load.ingredients.map((ingredient, ingredientIndex) => (
                <div
                  key={ingredientIndex}
                  className="grid gap-4 sm:grid-cols-2"
                >
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label>物料批次</Label>
                    <EntityReferenceSelect
                      kind="material_lot"
                      productLabel
                      value={ingredient.material_lot_id}
                      selectedVersion={ingredient.material_lot_version}
                      selectedSnapshot={ingredient.snapshot}
                      disabled={disabled}
                      allowedLotCategories={['chemical']}
                      onChange={(id, entity) =>
                        update(loadIndex, {
                          ...load,
                          ingredients: load.ingredients.map((item, current) =>
                            current === ingredientIndex
                              ? {
                                  ...item,
                                  material_lot_id: id,
                                  material_lot_version:
                                    entity?.latest_version?.version ?? 0,
                                  snapshot:
                                    entity?.latest_version?.data ?? undefined,
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>作用</Label>
                    <Select
                      value={ingredient.function_role}
                      disabled={disabled}
                      onValueChange={(value) =>
                        update(loadIndex, {
                          ...load,
                          ingredients: load.ingredients.map((item, current) =>
                            current === ingredientIndex
                              ? { ...item, function_role: value }
                              : item,
                          ),
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="请选择" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="metal_source">金属源</SelectItem>
                          <SelectItem value="chalcogen_source">
                            硫族元素源
                          </SelectItem>
                          <SelectItem value="dopant_source">掺杂源</SelectItem>
                          <SelectItem value="promoter">促进剂/盐</SelectItem>
                          <SelectItem value="other">其他</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-2">
                      <Label>用量</Label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={ingredient.amount ?? ''}
                        disabled={disabled}
                        onChange={(event) => {
                          const amount = number(event.target.value)
                          update(loadIndex, {
                            ...load,
                            ingredients: load.ingredients.map(
                              (item, current) =>
                                current === ingredientIndex
                                  ? {
                                      ...item,
                                      amount,
                                      unit:
                                        amount === undefined
                                          ? undefined
                                          : item.unit,
                                    }
                                  : item,
                            ),
                          })
                        }}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>单位</Label>
                      <Input
                        value={ingredient.unit ?? ''}
                        disabled={disabled || ingredient.amount === undefined}
                        placeholder="mg"
                        onChange={(event) =>
                          update(loadIndex, {
                            ...load,
                            ingredients: load.ingredients.map(
                              (item, current) =>
                                current === ingredientIndex
                                  ? { ...item, unit: event.target.value }
                                  : item,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                  {load.ingredients.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="sm:col-span-2 sm:justify-self-end"
                      disabled={disabled}
                      onClick={() =>
                        update(loadIndex, {
                          ...load,
                          ingredients: load.ingredients.filter(
                            (_, current) => current !== ingredientIndex,
                          ),
                        })
                      }
                    >
                      <Trash2 data-icon="inline-start" />
                      删除材料
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  update(loadIndex, {
                    ...load,
                    ingredients: [...load.ingredients, newIngredient()],
                  })
                }
              >
                <Plus data-icon="inline-start" />
                添加同一容器中的材料
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => onChange([...loads, newLoad()])}
        >
          <Plus data-icon="inline-start" />
          添加另一个前驱体容器
        </Button>
      </div>
    </ModuleCard>
  )
}

type FrozenReference = {
  entity_id: string
  version: number
  snapshot: Record<string, unknown>
}

function substrateReference(item: ModuleValues): FrozenReference | null {
  try {
    const value = JSON.parse(
      moduleValueAsString(item['lot_ref']) || 'null',
    ) as FrozenReference | null
    return value?.entity_id && value.version && value.snapshot ? value : null
  } catch {
    return null
  }
}

function newSubstrate(index: number): ModuleValues {
  return {
    ...emptyModuleValues('substrates'),
    piece_label: `S${index + 1}`,
  }
}

function jsonValue(value: unknown) {
  return value == null ? '' : JSON.stringify(value)
}

function parsedObject(value: ModuleValues[string]) {
  try {
    return JSON.parse(moduleValueAsString(value) || '{}') as Record<
      string,
      unknown
    >
  } catch {
    return {}
  }
}

function substrateStackSummary(value: unknown) {
  if (!Array.isArray(value)) return String(value ?? '')
  return value
    .map((layer) => {
      if (!layer || typeof layer !== 'object') return String(layer)
      const item = layer as Record<string, unknown>
      return [
        item.thickness_nm ? `${item.thickness_nm} nm` : '',
        item.material_name ?? item.chemical_formula ?? '',
      ]
        .filter(Boolean)
        .join(' ')
    })
    .filter(Boolean)
    .join(' / ')
}

export function SimpleSubstratesEditor({
  substrates,
  disabled,
  onChange,
}: {
  substrates: ModuleValues[]
  disabled: boolean
  onChange: (substrates: ModuleValues[]) => void
}) {
  const update = (index: number, patch: ModuleValues) =>
    onChange(
      substrates.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    )

  return (
    <ModuleCard id="module-substrates" title="衬底与摆放">
      <div className="flex flex-col gap-5">
        {substrates.map((item, index) => {
          const reference = substrateReference(item)
          const placement = parsedObject(item['size_placement'])
          const pretreatment = (() => {
            try {
              const steps = JSON.parse(
                moduleValueAsString(item['pretreatment_steps']) || '[]',
              ) as Array<{ other_name?: string }>
              return steps[0]?.other_name ?? ''
            } catch {
              return ''
            }
          })()
          const face =
            placement.placement === 'other' &&
            placement.placement_other === '面对另一片衬底'
              ? 'face_to_face'
              : String(placement.placement ?? '')
          return (
            <div
              key={moduleValueAsString(item['piece_label']) || index}
              className="flex flex-col gap-4 rounded-lg border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">衬底片 {index + 1}</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onChange([
                        ...substrates,
                        {
                          ...item,
                          piece_label: `S${substrates.length + 1}`,
                          source_id: '',
                        },
                      ])
                    }
                  >
                    <Copy data-icon="inline-start" />
                    复制本片
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onClick={() =>
                      onChange(
                        substrates
                          .filter((_, current) => current !== index)
                          .map((current, currentIndex) => ({
                            ...current,
                            piece_label: `S${currentIndex + 1}`,
                          })),
                      )
                    }
                  >
                    <Trash2 data-icon="inline-start" />
                    删除本片
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label>衬底批次</Label>
                <EntityReferenceSelect
                  kind="material_lot"
                  productLabel
                  value={reference?.entity_id ?? ''}
                  selectedVersion={reference?.version}
                  selectedSnapshot={reference?.snapshot}
                  disabled={disabled}
                  allowedLotCategories={['substrate']}
                  onChange={(id, entity) => {
                    const version = entity?.latest_version
                    const snapshot = version?.data ?? {}
                    update(index, {
                      lot_ref: id
                        ? JSON.stringify({
                            entity_id: id,
                            version: version?.version ?? 0,
                            snapshot,
                          })
                        : '',
                      ...materialLotProjection('substrates', snapshot),
                    })
                  }}
                />
                {reference?.snapshot.substrate_stack_layers ? (
                  <p className="text-sm text-muted-foreground">
                    衬底结构：
                    {substrateStackSummary(
                      reference.snapshot.substrate_stack_layers,
                    )}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label>长度（mm）</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={String(placement.length_mm ?? '')}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          length_mm: number(event.target.value),
                        }),
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>宽度（mm）</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={String(placement.width_mm ?? '')}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          width_mm: number(event.target.value),
                        }),
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>厚度（mm）</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={String(placement.thickness_mm ?? '')}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          thickness_mm: number(event.target.value),
                        }),
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>晶向</Label>
                  <Input
                    value={moduleValueAsString(item['crystal_orientation'])}
                    readOnly
                    placeholder="由衬底批次带入"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>表面预处理</Label>
                  <Input
                    value={pretreatment}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, {
                        pretreatment_steps: event.target.value.trim()
                          ? JSON.stringify([
                              {
                                type: 'other',
                                other_name: event.target.value,
                                parameters: {
                                  items: [
                                    {
                                      name: '说明',
                                      value: event.target.value,
                                      unit: '—',
                                    },
                                  ],
                                },
                              },
                            ])
                          : '',
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>轴向位置（mm）</Label>
                  <Input
                    type="number"
                    step="any"
                    value={moduleValueAsString(item['axial_position_mm'])}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, {
                        axial_position_mm: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label>生长面朝向</Label>
                  <Select
                    value={face}
                    disabled={disabled}
                    onValueChange={(value) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          placement: value === 'face_to_face' ? 'other' : value,
                          ...(value === 'face_to_face'
                            ? { placement_other: '面对另一片衬底' }
                            : { placement_other: undefined }),
                        }),
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="face_up">朝上</SelectItem>
                        <SelectItem value="face_down">朝下</SelectItem>
                        <SelectItem value="face_to_face">
                          面对另一片衬底
                        </SelectItem>
                        <SelectItem value="upright">其他</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>备注</Label>
                  <Input
                    value={moduleValueAsString(item['note'])}
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, { note: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          )
        })}
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onChange([...substrates, newSubstrate(substrates.length)])
          }
        >
          <Plus data-icon="inline-start" />
          添加衬底片
        </Button>
      </div>
    </ModuleCard>
  )
}

function minuteValue(seconds: number | undefined) {
  return seconds === undefined ? '' : String(seconds / 60)
}

function newTemperatureChannel(zone: number, setupId: string): SimpleChannel {
  return {
    channel_key: key('channel'),
    channel_type: 'temperature',
    source_type: 'setpoint',
    subject_type: 'temperature_zone',
    subject_ref: `zone_${zone}`,
    subject_instance_ref: `setup:${setupId}:zone:${zone}`,
    zone_index: zone,
    unit: '°C',
    data_kind: 'interval_series',
    series: [],
  }
}

function newGasChannel(species: string, setupId: string): SimpleChannel {
  return {
    channel_key: key('channel'),
    channel_type: 'flow',
    source_type: 'setpoint',
    subject_type: 'gas_species',
    subject_ref: species,
    subject_instance_ref: `setup:${setupId}:gas:${species}:1`,
    gas_species_code: species,
    unit: 'sccm',
    data_kind: 'interval_series',
    series: [],
  }
}

export function SimpleGrowthEditor({
  segments,
  channels,
  settings,
  events,
  runId,
  token,
  setupId,
  setupSnapshot,
  zoneCount,
  disabled,
  onTimelineChange,
  onSettingsChange,
  onEventsChange,
}: {
  segments: SimpleSegment[]
  channels: SimpleChannel[]
  settings: SimpleProcessSettings
  events: SimpleProcessEvent[]
  runId: string
  token: string
  setupId: string
  setupSnapshot: Record<string, unknown> | null
  zoneCount: number | null
  disabled: boolean
  onTimelineChange: (
    segments: SimpleSegment[],
    channels: SimpleChannel[],
  ) => void
  onSettingsChange: (settings: SimpleProcessSettings) => void
  onEventsChange: (events: SimpleProcessEvent[]) => void
}) {
  const growth = segments.find((item) => item.segment_type === 'growth')
  const setGrowth = (patch: Partial<SimpleSegment>) =>
    onTimelineChange(
      [
        {
          segment_key: growth?.segment_key ?? key('segment'),
          segment_type: 'growth',
          sequence: 1,
          start_s: growth?.start_s ?? 0,
          end_s: growth?.end_s ?? 0,
          ...patch,
        },
      ],
      channels,
    )
  const updateChannel = (channelKey: string, next: SimpleChannel) =>
    onTimelineChange(
      segments,
      channels.map((item) => (item.channel_key === channelKey ? next : item)),
    )
  const temperatureChannels = Array.from(
    { length: zoneCount ?? 0 },
    (_, index) =>
      channels.find(
        (item) =>
          item.channel_type === 'temperature' &&
          item.source_type === 'setpoint' &&
          item.zone_index === index + 1,
      ) ?? newTemperatureChannel(index + 1, setupId),
  )
  const gasChannels = channels.filter((item) => item.channel_type === 'flow')
  const pressure = channels.find((item) => item.channel_type === 'pressure')
  const processEvent = events[0]
  const eventText = splitEventDescription(processEvent?.description)
  const capabilities = Array.isArray(setupSnapshot?.field_devices)
    ? (setupSnapshot.field_devices as string[]).filter(
        (item) => item !== 'none',
      )
    : []
  const uploadMeasuredTemperature = async (zone: number, file: File) => {
    const existing = channels.find(
      (item) =>
        item.channel_type === 'temperature' &&
        item.source_type === 'measured' &&
        item.zone_index === zone,
    )
    const channelKey = existing?.channel_key ?? key('channel')
    try {
      const uploaded = await uploadExperimentFile(token, runId, {
        file,
        assetRole: 'process_timeseries',
        bindingType: 'process_channel',
        bindingId: channelKey,
      })
      const measured: SimpleChannel = {
        channel_key: channelKey,
        channel_type: 'temperature',
        source_type: 'measured',
        subject_type: 'temperature_zone',
        subject_ref: `zone_${zone}`,
        subject_instance_ref: `setup:${setupId}:zone:${zone}`,
        zone_index: zone,
        unit: '°C',
        data_kind: 'timeseries_file',
        file_asset_id: uploaded.id,
      }
      onTimelineChange(
        segments,
        existing
          ? channels.map((item) =>
              item.channel_key === channelKey ? measured : item,
            )
          : [...channels, measured],
      )
      toast.success(`温区 ${zone} 的实测温度曲线已上传`)
    } catch (error) {
      toast.error(resolveErrorMessage(error, '实测温度曲线上传失败'))
    }
  }

  return (
    <ModuleCard id="module-process_steps" title="生长条件">
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-4">
          <h3 className="font-medium">生长阶段</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>生长开始时间（min）</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={minuteValue(growth?.start_s)}
                disabled={disabled}
                onChange={(event) =>
                  setGrowth({
                    start_s: Number(event.target.value) * 60,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>生长结束时间（min）</Label>
              <Input
                type="number"
                min="0"
                step="any"
                value={minuteValue(growth?.end_s)}
                disabled={disabled}
                onChange={(event) =>
                  setGrowth({ end_s: Number(event.target.value) * 60 })
                }
              />
            </div>
          </div>
        </section>
        <Separator />

        <section className="flex flex-col gap-4">
          <h3 className="font-medium">温度程序</h3>
          {temperatureChannels.map((channel, zoneIndex) => (
            <div key={zoneIndex} className="flex flex-col gap-3">
              <p className="text-sm font-medium">温区 {zoneIndex + 1}</p>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-3 text-sm">
                <span>时间（min）</span>
                <span>设定温度（℃）</span>
                <span className="sr-only">操作</span>
                {(channel.series ?? []).map((point, pointIndex) => (
                  <Fragment key={`${channel.channel_key}-${pointIndex}`}>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={minuteValue(point.start_s)}
                      disabled={disabled || pointIndex === 0}
                      onChange={(event) =>
                        updateChannel(channel.channel_key, {
                          ...channel,
                          series: (channel.series ?? []).map((item, current) =>
                            current === pointIndex
                              ? {
                                  ...item,
                                  start_s: Number(event.target.value) * 60,
                                }
                              : item,
                          ),
                        })
                      }
                    />
                    <Input
                      type="number"
                      step="any"
                      value={String(point.value)}
                      disabled={disabled}
                      onChange={(event) =>
                        updateChannel(channel.channel_key, {
                          ...channel,
                          series: (channel.series ?? []).map((item, current) =>
                            current === pointIndex
                              ? {
                                  ...item,
                                  value: Number(event.target.value),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="删除时间点"
                      disabled={disabled}
                      onClick={() =>
                        updateChannel(channel.channel_key, {
                          ...channel,
                          series: (channel.series ?? []).filter(
                            (_, current) => current !== pointIndex,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </Fragment>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  const exists = channels.some(
                    (item) => item.channel_key === channel.channel_key,
                  )
                  const next = {
                    ...channel,
                    series: [
                      ...(channel.series ?? []),
                      {
                        start_s: channel.series?.length
                          ? (channel.series.at(-1)?.start_s ?? 0) + 60
                          : 0,
                        value: 0,
                      },
                    ],
                  }
                  onTimelineChange(
                    segments,
                    exists
                      ? channels.map((item) =>
                          item.channel_key === channel.channel_key
                            ? next
                            : item,
                        )
                      : [...channels, next],
                  )
                }}
              >
                <Plus data-icon="inline-start" />
                添加时间点
              </Button>
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">
                  上传实测温度曲线（选填）
                </summary>
                <Input
                  className="mt-3"
                  type="file"
                  accept=".csv,.tsv,.txt,.xlsx"
                  disabled={disabled}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void uploadMeasuredTemperature(zoneIndex + 1, file)
                    }
                    event.target.value = ''
                  }}
                />
              </details>
            </div>
          ))}
        </section>
        <Separator />

        <section className="flex flex-col gap-4">
          <h3 className="font-medium">气体程序</h3>
          {gasChannels.map((channel) => (
            <div
              key={channel.channel_key}
              className="flex flex-col gap-4 rounded-lg border p-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label>气体种类</Label>
                  <Select
                    value={channel.gas_species_code}
                    disabled={disabled}
                    onValueChange={(value) =>
                      updateChannel(channel.channel_key, {
                        ...channel,
                        subject_ref: value,
                        gas_species_code: value,
                        subject_instance_ref: `setup:${setupId}:gas:${value}:1`,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.keys(gasSpecies).map((species) => (
                          <SelectItem key={species} value={species}>
                            {species}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>气瓶批次</Label>
                  <EntityReferenceSelect
                    kind="material_lot"
                    productLabel
                    value={channel.gas_lot_id ?? ''}
                    selectedVersion={channel.gas_lot_version}
                    disabled={disabled}
                    allowedLotCategories={['gas_cylinder']}
                    onChange={(id, entity) =>
                      updateChannel(channel.channel_key, {
                        ...channel,
                        gas_lot_id: id || undefined,
                        gas_lot_version:
                          entity?.latest_version?.version ?? undefined,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-3 text-sm">
                <span>开始时间（min）</span>
                <span>结束时间（min）</span>
                <span>流量（sccm）</span>
                <span className="sr-only">操作</span>
                {(channel.series ?? []).map((interval, intervalIndex) => (
                  <Fragment key={`${channel.channel_key}-${intervalIndex}`}>
                    {(
                      [
                        ['start_s', interval.start_s / 60],
                        ['end_s', (interval.end_s ?? 0) / 60],
                        ['value', interval.value],
                      ] as const
                    ).map(([field, value]) => (
                      <Input
                        key={`${intervalIndex}-${field}`}
                        type="number"
                        min="0"
                        step="any"
                        value={String(value)}
                        disabled={disabled}
                        onChange={(event) =>
                          updateChannel(channel.channel_key, {
                            ...channel,
                            series: (channel.series ?? []).map(
                              (item, current) =>
                                current === intervalIndex
                                  ? {
                                      ...item,
                                      [field]:
                                        field === 'value'
                                          ? Number(event.target.value)
                                          : Number(event.target.value) * 60,
                                    }
                                  : item,
                            ),
                          })
                        }
                      />
                    ))}
                    <Button
                      key={`${intervalIndex}-delete`}
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label="删除供气区间"
                      disabled={disabled}
                      onClick={() =>
                        updateChannel(channel.channel_key, {
                          ...channel,
                          series: (channel.series ?? []).filter(
                            (_, current) => current !== intervalIndex,
                          ),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </Fragment>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    updateChannel(channel.channel_key, {
                      ...channel,
                      series: [
                        ...(channel.series ?? []),
                        {
                          start_s: channel.series?.at(-1)?.end_s ?? 0,
                          end_s: (channel.series?.at(-1)?.end_s ?? 0) + 60,
                          value: 0,
                        },
                      ],
                    })
                  }
                >
                  <Plus data-icon="inline-start" />
                  添加供气区间
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    onTimelineChange(
                      segments,
                      channels.filter(
                        (item) => item.channel_key !== channel.channel_key,
                      ),
                    )
                  }
                >
                  <Trash2 data-icon="inline-start" />
                  删除这种气体
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              onTimelineChange(segments, [
                ...channels,
                newGasChannel('Ar', setupId),
              ])
            }
          >
            <Plus data-icon="inline-start" />
            添加一种气体
          </Button>
        </section>
        <Separator />

        <section className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <Label>压力制度</Label>
            <Select
              value={settings.pressure_regime}
              disabled={disabled}
              onValueChange={(value) => {
                const regime = value as SimpleProcessSettings['pressure_regime']
                onSettingsChange({ ...settings, pressure_regime: regime })
                if (regime === 'atmospheric') {
                  onTimelineChange(
                    segments,
                    channels.filter((item) => item.channel_type !== 'pressure'),
                  )
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="atmospheric">常压</SelectItem>
                  <SelectItem value="low_pressure">低压</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {settings.pressure_regime &&
            settings.pressure_regime !== 'atmospheric' ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2">
                  <Label>工作压力</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={pressure?.scalar_value ?? ''}
                    disabled={disabled}
                    onChange={(event) => {
                      const next: SimpleChannel = {
                        channel_key: pressure?.channel_key ?? key('channel'),
                        channel_type: 'pressure',
                        source_type: 'setpoint',
                        subject_type: 'pressure_location',
                        subject_ref: 'reactor',
                        subject_instance_ref: `setup:${setupId}:pressure:1`,
                        pressure_location: 'reactor',
                        pressure_type: pressure?.pressure_type ?? 'unspecified',
                        unit: pressure?.unit ?? 'Pa',
                        data_kind: 'scalar',
                        scalar_value: Number(event.target.value),
                      }
                      onTimelineChange(
                        segments,
                        pressure
                          ? channels.map((item) =>
                              item.channel_key === pressure.channel_key
                                ? next
                                : item,
                            )
                          : [...channels, next],
                      )
                    }}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>单位</Label>
                  <Select
                    value={pressure?.unit ?? 'Pa'}
                    disabled={disabled}
                    onValueChange={(value) =>
                      pressure &&
                      updateChannel(pressure.channel_key, {
                        ...pressure,
                        unit: value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {['Pa', 'kPa', 'mbar', 'Torr'].map((unit) => (
                          <SelectItem key={unit} value={unit}>
                            {unit}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>压力类型</Label>
                  <Select
                    value={pressure?.pressure_type ?? 'unspecified'}
                    disabled={disabled}
                    onValueChange={(value) =>
                      pressure &&
                      updateChannel(pressure.channel_key, {
                        ...pressure,
                        pressure_type: value,
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="absolute">绝对压力</SelectItem>
                        <SelectItem value="gauge">表压</SelectItem>
                        <SelectItem value="unspecified">不清楚</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <Label>降温方式</Label>
            <Select
              value={settings.cooling_method}
              disabled={disabled}
              onValueChange={(value) =>
                onSettingsChange({
                  ...settings,
                  cooling_method:
                    value as SimpleProcessSettings['cooling_method'],
                  cooling_other:
                    value === 'other' ? settings.cooling_other : undefined,
                })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="请选择" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="natural">自然冷却</SelectItem>
                  <SelectItem value="rapid_furnace_move">快速移炉</SelectItem>
                  <SelectItem value="controlled">受控降温</SelectItem>
                  <SelectItem value="other">其他</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {settings.cooling_method === 'other' ? (
              <Input
                value={settings.cooling_other ?? ''}
                disabled={disabled}
                placeholder="请说明降温方式"
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    cooling_other: event.target.value,
                  })
                }
              />
            ) : null}
          </div>
        </section>

        {capabilities.length > 0 ? (
          <>
            <Separator />
            <section className="flex flex-col gap-3">
              <h3 className="font-medium">外场或等离子体</h3>
              <div className="flex flex-wrap gap-4">
                {capabilities.map((capability) => (
                  <Label key={capability} className="flex items-center gap-2">
                    <Checkbox
                      checked={(settings.external_fields ?? []).includes(
                        capability,
                      )}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        onSettingsChange({
                          ...settings,
                          external_fields:
                            checked === true
                              ? [
                                  ...(settings.external_fields ?? []),
                                  capability,
                                ]
                              : (settings.external_fields ?? []).filter(
                                  (item) => item !== capability,
                                ),
                        })
                      }
                    />
                    {
                      {
                        plasma: '使用等离子体',
                        electric_field: '使用电场',
                        magnetic_field: '使用磁场',
                        light: '使用光照',
                      }[capability]
                    }
                  </Label>
                ))}
              </div>
            </section>
          </>
        ) : null}
        <Separator />

        <section className="flex flex-col gap-4">
          <Label>本炉是否发生异常</Label>
          <Select
            value={events.length > 0 ? 'yes' : 'no'}
            disabled={disabled}
            onValueChange={(value) =>
              onEventsChange(
                value === 'yes'
                  ? [
                      processEvent ?? {
                        event_key: key('event'),
                        start_s: 0,
                        observed_deviations: ['manual_intervention'],
                        intervention_actions: [],
                        affected_objects: [],
                        suspected_causes: [],
                        data_validity_impact: 'unknown',
                        excluded_time_ranges: [],
                        attachment_file_ids: [],
                      },
                    ]
                  : [],
              )
            }
          >
            <SelectTrigger className="w-full sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="no">否</SelectItem>
                <SelectItem value="yes">是</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          {processEvent ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>发生时间（min）</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={minuteValue(processEvent.start_s)}
                  disabled={disabled}
                  onChange={(inputEvent) =>
                    onEventsChange([
                      {
                        ...processEvent,
                        start_s: Number(inputEvent.target.value) * 60,
                      },
                    ])
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>是否影响本炉数据</Label>
                <Select
                  value={processEvent.data_validity_impact ?? 'unknown'}
                  disabled={disabled}
                  onValueChange={(value) =>
                    onEventsChange([
                      { ...processEvent, data_validity_impact: value },
                    ])
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">不影响</SelectItem>
                      <SelectItem value="partial">部分影响</SelectItem>
                      <SelectItem value="invalid">本炉数据不应使用</SelectItem>
                      <SelectItem value="unknown">不确定</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label>异常情况</Label>
                <Textarea
                  value={eventText.description}
                  disabled={disabled}
                  onChange={(inputEvent) =>
                    onEventsChange([
                      {
                        ...processEvent,
                        description: buildEventDescription(
                          inputEvent.target.value,
                          eventText.action,
                        ),
                      },
                    ])
                  }
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>采取的处理</Label>
                <Textarea
                  value={eventText.action}
                  disabled={disabled}
                  onChange={(inputEvent) =>
                    onEventsChange([
                      {
                        ...processEvent,
                        intervention_actions: inputEvent.target.value.trim()
                          ? ['other']
                          : [],
                        description: buildEventDescription(
                          eventText.description,
                          inputEvent.target.value,
                        ),
                      },
                    ])
                  }
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </ModuleCard>
  )
}
