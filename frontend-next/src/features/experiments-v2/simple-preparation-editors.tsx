import { useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { gasSpecies } from '@/shared/generated/field-metadata'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { localizedOption } from '@/shared/field-i18n'
import {
  buildFieldParamsEditorLabels,
  buildTreatmentStepsEditorLabels,
} from '@/shared/structured-editor-labels'
import { RequiredMark } from '@/shared/ui/required-mark'
import { EmptyState } from '@/shared/ui/empty-state'
import { uploadExperimentFile } from '@/features/samples/api'

import type { ModuleValues, SubstratePlacementRelation } from './field-logic'
import { emptySubstrateValues, moduleValueAsString } from './field-logic'
import { EntityReferenceSelect } from './components/entity-reference-select'
import { gasCylinderMatchesSpecies } from './components/reference-snapshot'
import { ExperimentAttachments } from './components/experiment-attachments'
import { FormulaInput } from './components/formula-input'
import {
  actualFieldTypes,
  FieldParamsEditor,
} from './components/process-detail-editors'
import type { ActualField } from './components/process-detail-editors'
import { materialLotProjection } from './material-lot-projection'
import { ModuleCard } from './components/module-card'
import { TargetBulkPhaseSelect } from './components/target-bulk-phase-select'
import {
  TreatmentStepsEditor,
  sourceTreatmentTypesFor,
  normalizeTreatmentSteps,
  treatmentStepsAreValid,
} from './components/treatment-steps-editor'
import type {
  TreatmentStep,
  TreatmentType,
} from './components/treatment-steps-editor'
import {
  ELEMENT_SYMBOLS,
  formatChemicalFormula,
  generateSolidSolutionFormula,
  validateChemicalFormula,
} from './formula'
import {
  targetSummary,
  targetValidationIssue,
} from './scientific-form-workflow'
import {
  commonSuggestedBulkSpaceGroups,
  couldMatchMaterialPhaseCatalog,
  suggestedBulkSpaceGroups,
} from './space-groups'
import {
  PROCESS_DEVIATION_OPTIONS,
  buildEventDescription,
  compositionValueForDisplay,
  compositionValueForPayload,
  simplePreparationIssue,
  splitEventDescription,
  temperatureStepOperation,
  updateTemperatureStepDuration,
  wholeProcessInterval,
} from './simple-form-adapters'
import type {
  GasTimingPreset,
  SimpleCoolingStep,
  SimplePreparationOperation,
} from './simple-form-adapters'

export type SimpleRegion = {
  region_key: string
  formula: string
  spatial_role: 'single_region' | 'layer' | 'lateral_region' | 'mixed_region'
  layer_index?: number
  lateral_region?: string
  target_layer_count?: number
  target_bulk_phase?: string
  target_bulk_space_group_number?: number
}

export type SimpleCompositionRelation = {
  relation_type:
    | 'doped_by'
    | 'substitutional_alloy'
    | 'solid_solution_component'
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

export type SimpleIngredient = {
  material_lot_id: string
  material_lot_version: number
  /** 旧记录只读兼容；新保存不再写入。 */
  function_role?: string
  /** 旧载荷兼容；保存时剔除，不展示或用于校验。 */
  process_roles?: string[]
  process_role_other?: string
  amount?: number
  unit?: string
  concentration_value?: number
  concentration_unit?: string
  concentration_unit_other?: string
  snapshot?: Record<string, unknown>
}

export type SimpleSourceLoad = {
  attrs?: Record<string, unknown>
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
  ingredients: SimpleIngredient[]
}

const CONCENTRATION_UNITS = [
  ['mol_per_L', 'mol/L'],
  ['mmol_per_L', 'mmol/L (mM)'],
  ['g_per_L', 'g/L'],
  ['mg_per_mL', 'mg/mL'],
  ['wt_percent', 'wt%'],
  ['vol_percent', 'vol%'],
  ['other', '其他'],
] as const
const CONCENTRATION_UNIT_CODES = new Set<string>(
  CONCENTRATION_UNITS.map(([value]) => value),
)
const AMOUNT_UNITS = ['mg', 'g', 'μL', 'mL'] as const

export function sourceLoadIngredientsAreValid(
  ingredients: SimpleIngredient[],
  hasSolution = false,
  amountRequired = true,
  concentrationRequired = false,
  volumeRequired = false,
): boolean {
  const lotIds = new Set<string>()
  return (
    ingredients.length > 0 &&
    ingredients.every((ingredient) => {
      if (
        !ingredient.material_lot_id ||
        lotIds.has(ingredient.material_lot_id)
      ) {
        return false
      }
      lotIds.add(ingredient.material_lot_id)
      const amountValid =
        !amountRequired ||
        (Number.isFinite(ingredient.amount) &&
          Number(ingredient.amount) > 0 &&
          Boolean(ingredient.unit?.trim()))
      if (
        volumeRequired &&
        !['μL', 'µL', 'uL', 'mL', 'L'].includes(ingredient.unit ?? '')
      )
        return false
      if (!amountValid || !hasSolution) return amountValid
      const hasConcentration =
        ingredient.concentration_value !== undefined ||
        Boolean(ingredient.concentration_unit) ||
        Boolean(ingredient.concentration_unit_other?.trim())
      if (!hasConcentration) return !concentrationRequired
      return Boolean(
        Number.isFinite(ingredient.concentration_value) &&
        Number(ingredient.concentration_value) > 0 &&
        ingredient.concentration_unit &&
        CONCENTRATION_UNIT_CODES.has(ingredient.concentration_unit) &&
        (ingredient.concentration_unit !== 'other' ||
          ingredient.concentration_unit_other?.trim()),
      )
    })
  )
}

export type SimpleSegment = {
  segment_key: string
  segment_type: string
  sequence: number
  start_s: number
  end_s: number
  label?: string
  note?: string
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
  measurement_source?: 'mfc' | 'rotameter' | 'other'
  measurement_source_other?: string
  zone_index?: number
  pressure_location?: string
  pressure_type?: string
  unit: string
  data_kind: 'scalar' | 'interval_series' | 'timeseries_file'
  scalar_value?: number
  series?: Array<{
    start_s: number
    end_s?: number
    value: number | string
    timing_preset?: GasTimingPreset
  }>
  file_asset_id?: string
}

export type SimpleProcessSettings = {
  process_duration_min?: number
  pressure_regime?: 'atmospheric' | 'low_pressure' | 'high_pressure' | 'other'
  cooling_method?:
    | 'furnace_cooling'
    | 'open_lid_cooling'
    | 'rapid_furnace_move_cooling'
    | 'controlled_cooling'
    | 'staged_cooling'
    | 'other'
  cooling_sequence?: SimpleCoolingStep[]
  cooling_other?: string
  cooling_rate_C_per_min?: number
  lid_open_temperature_C?: number
  preparation_operations?: SimplePreparationOperation[]
  field_params?: ActualField[]
  /** 旧草稿兼容；新记录使用 field_params。 */
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

function newProcessEvent(): SimpleProcessEvent {
  return {
    event_key: key('event'),
    start_s: Number.NaN,
    observed_deviations: [],
    intervention_actions: [],
    affected_objects: [],
    suspected_causes: [],
    data_validity_impact: 'unknown',
    outcome: 'unknown',
    excluded_time_ranges: [],
    attachment_file_ids: [],
  }
}

function number(value: string): number | undefined {
  return value.trim() === '' ? undefined : Number(value)
}

export type TargetKind = 'single' | 'doped' | 'alloy' | 'vertical' | 'lateral'

export type TargetDrafts = Partial<Record<TargetKind, SimpleTarget>>

export function targetKind(target: SimpleTarget): TargetKind {
  if (target.architecture_type === 'vertical_stack') return 'vertical'
  if (target.architecture_type === 'lateral_junction') return 'lateral'
  if (
    target.composition_relations.some((relation) =>
      ['substitutional_alloy', 'solid_solution_component'].includes(
        relation.relation_type,
      ),
    )
  ) {
    return 'alloy'
  }
  return target.composition_relations[0]?.relation_type === 'doped_by'
    ? 'doped'
    : 'single'
}

export function changeTargetKind(
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
  if (kindValue === 'doped') {
    return {
      ...target,
      architecture_type: 'single_region',
      material_regions: [singleRegion],
      composition_relations: [
        {
          relation_type: 'doped_by',
          host_region_key: 'film',
          species: '',
          value_basis: 'unspecified',
        },
      ],
    }
  }
  if (kindValue === 'alloy') {
    return {
      ...target,
      architecture_type: 'single_region',
      material_regions: [{ ...singleRegion, formula: '' }],
      composition_relations: [firstFormula, ''].map((species) => ({
        relation_type: 'solid_solution_component',
        host_region_key: 'film',
        species,
        value_basis: 'mol_fraction',
      })),
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

export function switchTargetDraft(
  target: SimpleTarget,
  nextKind: TargetKind,
  drafts: TargetDrafts,
): [SimpleTarget, TargetDrafts] {
  const saved = { ...drafts, [targetKind(target)]: target }
  const next = saved[nextKind] ?? changeTargetKind(target, nextKind)
  return [next, { ...saved, [nextKind]: next }]
}

export function SimpleTargetEditor({
  target,
  onChange,
  onKindChange,
  disabled,
  showErrors,
}: {
  target: SimpleTarget
  onChange: (target: SimpleTarget) => void
  onKindChange?: (kind: TargetKind) => void
  disabled: boolean
  showErrors?: boolean
}) {
  const kindValue = targetKind(target)
  const relation = target.composition_relations[0]
  const [phaseWarnings, setPhaseWarnings] = useState<Record<string, boolean>>(
    {},
  )
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
  const alloyRelations = target.composition_relations.filter(
    (item) => item.relation_type === 'solid_solution_component',
  )
  const setAlloyRelations = (relations: SimpleCompositionRelation[]) => {
    const formula =
      generateSolidSolutionFormula(
        relations.map((item) => ({
          formula: item.species,
          fraction: item.nominal_value,
        })),
      ) ?? ''
    const currentRegion = target.material_regions[0]
    const candidates = commonSuggestedBulkSpaceGroups(
      relations.map((item) => item.species),
    )
    const previousCandidates = commonSuggestedBulkSpaceGroups(
      alloyRelations.map((item) => item.species),
    )
    const clearPhase =
      previousCandidates.some(
        (candidate) =>
          candidate.phase === currentRegion?.target_bulk_phase &&
          candidate.number === currentRegion.target_bulk_space_group_number,
      ) &&
      !candidates.some(
        (candidate) =>
          candidate.phase === currentRegion.target_bulk_phase &&
          candidate.number === currentRegion.target_bulk_space_group_number,
      )
    onChange({
      ...target,
      material_regions: target.material_regions.map((item, index) =>
        index === 0
          ? {
              ...item,
              formula,
              ...(clearPhase
                ? {
                    target_bulk_phase: undefined,
                    target_bulk_space_group_number: undefined,
                  }
                : {}),
            }
          : item,
      ),
      composition_relations: relations,
    })
    if (clearPhase) {
      setPhaseWarnings((current) => ({
        ...current,
        [currentRegion.region_key]: true,
      }))
    }
  }
  const updateAlloyRelation = (
    index: number,
    patch: Partial<SimpleCompositionRelation>,
  ) =>
    setAlloyRelations(
      alloyRelations.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    )
  const switchKind = (kind: TargetKind) => {
    if (onKindChange) onKindChange(kind)
    else onChange(changeTargetKind(target, kind))
  }
  const updateFormula = (index: number, formula: string) => {
    const region = target.material_regions[index]
    const matchingPhase = suggestedBulkSpaceGroups(formula).some(
      (candidate) =>
        candidate.phase === region.target_bulk_phase &&
        candidate.number === region.target_bulk_space_group_number,
    )
    const clearPhase =
      Boolean(region.target_bulk_phase) &&
      !matchingPhase &&
      !couldMatchMaterialPhaseCatalog(formula)
    const elements = validateChemicalFormula(formula).elements
    const currentSite = relation?.site_or_location
    const clearSite =
      kindValue === 'doped' &&
      currentSite?.endsWith('_site') &&
      !elements.includes(currentSite.slice(0, -5))
    onChange({
      ...target,
      material_regions: target.material_regions.map((item, current) =>
        current === index
          ? {
              ...item,
              formula,
              ...(clearPhase
                ? {
                    target_bulk_phase: undefined,
                    target_bulk_space_group_number: undefined,
                  }
                : {}),
            }
          : item,
      ),
      composition_relations:
        clearSite && relation
          ? [{ ...relation, site_or_location: undefined }]
          : target.composition_relations,
    })
    if (clearPhase) {
      setPhaseWarnings((current) => ({
        ...current,
        [region.region_key]: true,
      }))
    }
  }
  const phaseSelect = (
    region: SimpleRegion,
    index: number,
    label?: string,
    candidateFormulas?: string[],
  ) => (
    <div className="flex flex-col gap-1">
      <TargetBulkPhaseSelect
        formula={region.formula}
        candidateFormulas={candidateFormulas}
        phase={region.target_bulk_phase}
        spaceGroupNumber={region.target_bulk_space_group_number}
        disabled={disabled}
        label={label}
        onChange={(phase, spaceGroupNumber) => {
          setPhaseWarnings((current) => ({
            ...current,
            [region.region_key]: false,
          }))
          setRegion(index, {
            target_bulk_phase: phase,
            target_bulk_space_group_number: spaceGroupNumber,
          })
        }}
      />
      {phaseWarnings[region.region_key] ? (
        <p className="text-xs text-amber-700">
          化学式已变更，原晶体结构选择已清除，请重新选择。
        </p>
      ) : null}
    </div>
  )
  const region = target.material_regions[0] ?? {
    region_key: 'film',
    formula: '',
    spatial_role: 'single_region' as const,
  }
  const targetIssue = showErrors ? targetValidationIssue(target) : null
  const formulaInvalid = (formula: string) =>
    Boolean(
      showErrors &&
      (!formula.trim() || !validateChemicalFormula(formula).valid),
    )
  const dopantInvalid = Boolean(
    showErrors &&
    (!relation?.species ||
      !ELEMENT_SYMBOLS.includes(relation.species as never)),
  )
  const alloyFractionInvalid = (value: number | undefined) =>
    Boolean(showErrors && (value === undefined || value <= 0 || value >= 1))
  const dopantAmountInvalid = Boolean(
    showErrors &&
    relation?.nominal_value !== undefined &&
    (!(relation.nominal_value > 0) ||
      (relation.value_basis === 'at_percent'
        ? relation.nominal_value >= 100
        : relation.nominal_value >= 1)),
  )
  const elements = validateChemicalFormula(region?.formula ?? '').elements
  const moveRegion = (index: number, offset: number) => {
    const next = [...target.material_regions]
    const destination = index + offset
    if (destination < 0 || destination >= next.length) return
    ;[next[index], next[destination]] = [next[destination], next[index]]
    onChange({
      ...target,
      material_regions: next.map((item, current) => ({
        ...item,
        layer_index: current + 1,
      })),
    })
  }
  const moreInformation = (
    <div className="grid gap-4 sm:grid-cols-2">
      {!['vertical', 'lateral'].includes(kindValue) ? (
        <div className="flex flex-col gap-2">
          <Label>目标层数</Label>
          <Input
            type="number"
            min="1"
            step="1"
            value={region?.target_layer_count ?? ''}
            disabled={disabled}
            aria-label="目标层数"
            onChange={(event) =>
              setRegion(0, {
                target_layer_count: number(event.target.value),
              })
            }
          />
          <p className="text-xs text-muted-foreground">
            仅层状材料填写；例如单层 MoS₂ 填 1，非层状材料留空。
          </p>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label>目标产物形态</Label>
        <Select
          value={target.dimensional_form ?? ''}
          disabled={disabled}
          onValueChange={(value) =>
            onChange({
              ...target,
              dimensional_form: value as SimpleTarget['dimensional_form'],
              in_plane_outline:
                value === 'discrete_planar_crystal'
                  ? target.in_plane_outline
                  : undefined,
            })
          }
        >
          <SelectTrigger className="w-full" aria-label="目标产物形态">
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="continuous_film">连续膜</SelectItem>
              <SelectItem value="discrete_planar_crystal">
                分立片状晶体/晶畴
              </SelectItem>
              <SelectItem value="ribbon">带状</SelectItem>
              <SelectItem value="wire">线状</SelectItem>
              <SelectItem value="tube">管状</SelectItem>
              <SelectItem value="rod">棒状</SelectItem>
              <SelectItem value="particle">颗粒</SelectItem>
              <SelectItem value="bulk_crystal">块状晶体</SelectItem>
              <SelectItem value="other">其他</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {target.dimensional_form === 'discrete_planar_crystal' ? (
        <div className="flex flex-col gap-2">
          <Label>目标平面轮廓</Label>
          <Select
            value={target.in_plane_outline ?? ''}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({
                ...target,
                in_plane_outline: value as SimpleTarget['in_plane_outline'],
              })
            }
          >
            <SelectTrigger className="w-full" aria-label="目标平面轮廓">
              <SelectValue placeholder="请选择" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="triangle">三角形</SelectItem>
                <SelectItem value="truncated_triangle">截角三角形</SelectItem>
                <SelectItem value="hexagon">六边形</SelectItem>
                <SelectItem value="quadrilateral">
                  四边形（矩形/平行四边形/菱形）
                </SelectItem>
                <SelectItem value="other_regular_polygon">
                  其他规则多边形
                </SelectItem>
                <SelectItem value="circular_elliptical">圆形/椭圆形</SelectItem>
                <SelectItem value="lobed_star">星形/多裂片状</SelectItem>
                <SelectItem value="dendritic_fractal">枝晶状/分形</SelectItem>
                <SelectItem value="irregular">不规则</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label>实验目标</Label>
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
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label>补充说明</Label>
        <Textarea
          value={target.note ?? ''}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...target, note: event.target.value })
          }
        />
      </div>
    </div>
  )

  return (
    <ModuleCard id="module-target_product" title="目标材料">
      {targetIssue ? (
        <p className="text-destructive text-sm">{targetIssue}</p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label>
          目标材料体系 <RequiredMark />
        </Label>
        <Select
          value={
            kindValue === 'vertical' || kindValue === 'lateral'
              ? 'heterostructure'
              : kindValue
          }
          disabled={disabled}
          onValueChange={(value) =>
            switchKind(
              value === 'heterostructure' ? 'vertical' : (value as TargetKind),
            )
          }
        >
          <SelectTrigger className="w-full" aria-label="目标材料体系">
            <SelectValue placeholder="请选择" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="single">本征材料</SelectItem>
              <SelectItem value="doped">掺杂材料</SelectItem>
              <SelectItem value="alloy">合金</SelectItem>
              <SelectItem value="heterostructure">异质结构</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {kindValue === 'vertical' || kindValue === 'lateral' ? (
        <div className="flex flex-col gap-2">
          <Label>
            异质结构类型 <RequiredMark />
          </Label>
          <Select
            value={kindValue}
            disabled={disabled}
            onValueChange={(value) => switchKind(value as TargetKind)}
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

      {kindValue === 'single' || kindValue === 'doped' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div
            className="flex flex-col gap-2"
            data-invalid={formulaInvalid(region?.formula ?? '') || undefined}
          >
            <Label>
              {kindValue === 'single' ? '目标材料化学式' : '基体材料化学式'}{' '}
              <RequiredMark />
            </Label>
            <FormulaInput
              value={region?.formula ?? ''}
              disabled={disabled}
              placeholder="例如 MoS2"
              required
              showErrors={showErrors}
              onChange={(value) => updateFormula(0, value)}
            />
          </div>
          <div>
            {phaseSelect(
              region,
              0,
              kindValue === 'doped' ? '基体晶体结构' : undefined,
            )}
          </div>
          {kindValue === 'doped' ? (
            <>
              <div
                className="flex flex-col gap-2"
                data-invalid={dopantInvalid || undefined}
              >
                <Label>
                  掺杂元素 <RequiredMark />
                </Label>
                <Input
                  list="target-element-symbols"
                  value={relation?.species ?? ''}
                  disabled={disabled}
                  placeholder="搜索元素符号，例如 Pt"
                  aria-invalid={dopantInvalid || undefined}
                  onChange={(event) =>
                    setRelation({ species: event.target.value })
                  }
                />
                {dopantInvalid ? (
                  <p className="text-destructive text-sm">
                    请选择合法的掺杂元素。
                  </p>
                ) : null}
              </div>
              <div
                className="flex flex-col gap-2"
                data-invalid={dopantAmountInvalid || undefined}
              >
                <Label>目标含量</Label>
                <div className="grid grid-cols-[1fr_8rem] gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={compositionValueForDisplay(
                      relation?.nominal_value,
                      relation?.value_basis ?? 'at_percent',
                    )}
                    disabled={disabled}
                    placeholder="例如 1"
                    aria-invalid={dopantAmountInvalid || undefined}
                    onChange={(event) =>
                      setRelation({
                        nominal_value: compositionValueForPayload(
                          event.target.value,
                          relation?.value_basis === 'mol_fraction'
                            ? 'mol_fraction'
                            : 'at_percent',
                        ),
                        value_basis:
                          event.target.value.trim() === ''
                            ? 'unspecified'
                            : relation?.value_basis === 'mol_fraction'
                              ? 'mol_fraction'
                              : 'at_percent',
                      })
                    }
                  />
                  <Select
                    value={
                      relation?.value_basis === 'mol_fraction'
                        ? 'mol_fraction'
                        : 'at_percent'
                    }
                    disabled={disabled}
                    onValueChange={(value) =>
                      setRelation({
                        value_basis:
                          value as SimpleCompositionRelation['value_basis'],
                        nominal_value: compositionValueForPayload(
                          compositionValueForDisplay(
                            relation?.nominal_value,
                            relation?.value_basis ?? 'at_percent',
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
                        <SelectItem value="at_percent">at.%</SelectItem>
                        <SelectItem value="mol_fraction">mol.%</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                {dopantAmountInvalid ? (
                  <p className="text-destructive text-sm">
                    目标含量必须大于 0 且小于 100%。
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label>目标位点</Label>
                <Select
                  value={
                    relation?.site_or_location?.startsWith('other:')
                      ? 'other'
                      : (relation?.site_or_location ?? 'unspecified')
                  }
                  disabled={disabled}
                  onValueChange={(value) =>
                    setRelation({
                      site_or_location: value === 'other' ? 'other:' : value,
                    })
                  }
                >
                  <SelectTrigger className="w-full" aria-label="目标位点">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {elements.length > 0 ? (
                      <>
                        <SelectGroup>
                          <SelectLabel>取代位点</SelectLabel>
                          {elements.map((element) => (
                            <SelectItem key={element} value={`${element}_site`}>
                              {element} 位点
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectSeparator />
                      </>
                    ) : null}
                    <SelectGroup>
                      <SelectLabel>非取代位点</SelectLabel>
                      <SelectItem value="interstitial">间隙位点</SelectItem>
                      <SelectItem value="interlayer">层间位置</SelectItem>
                      <SelectItem value="surface">表面位置</SelectItem>
                    </SelectGroup>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectItem value="unspecified">未指定</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {relation?.site_or_location?.startsWith('other:') ? (
                  <Input
                    value={relation.site_or_location.slice(6)}
                    disabled={disabled}
                    placeholder="请输入目标位点"
                    onChange={(event) =>
                      setRelation({
                        site_or_location: `other:${event.target.value}`,
                      })
                    }
                  />
                ) : null}
              </div>
            </>
          ) : null}
          <div className="rounded-lg bg-muted/50 p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">目标材料预览</p>
            <p className="mt-1 font-medium">
              {targetSummary(target) || '请填写目标材料'}
            </p>
          </div>
        </div>
      ) : kindValue === 'alloy' ? (
        <div className="flex flex-col gap-4">
          <div>
            <Label>
              合金组分 <RequiredMark />
            </Label>
            <p className="mt-1 text-sm text-muted-foreground">
              至少填写两个组分，摩尔分数之和为 1。
            </p>
          </div>
          {alloyRelations.map((component, index) => (
            <div
              key={`${index}-${component.host_region_key}`}
              className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
            >
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="font-medium">
                  组分 {String.fromCharCode(65 + index)}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || alloyRelations.length <= 2}
                  onClick={() =>
                    setAlloyRelations(
                      alloyRelations.filter((_, current) => current !== index),
                    )
                  }
                >
                  <Trash2 data-icon="inline-start" />
                  删除
                </Button>
              </div>
              <div
                className="flex flex-col gap-2"
                data-invalid={formulaInvalid(component.species) || undefined}
              >
                <Label>
                  材料化学式 <RequiredMark />
                </Label>
                <FormulaInput
                  value={component.species}
                  disabled={disabled}
                  placeholder={index === 0 ? '例如 MoS2' : '例如 WS2'}
                  required
                  showErrors={showErrors}
                  onChange={(species) =>
                    updateAlloyRelation(index, { species })
                  }
                />
              </div>
              <div
                className="flex flex-col gap-2"
                data-invalid={
                  alloyFractionInvalid(component.nominal_value) || undefined
                }
              >
                <Label>
                  目标摩尔分数 <RequiredMark />
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="1"
                  step="any"
                  value={component.nominal_value ?? ''}
                  disabled={disabled}
                  placeholder="例如 0.5"
                  aria-invalid={
                    alloyFractionInvalid(component.nominal_value) || undefined
                  }
                  onChange={(event) =>
                    updateAlloyRelation(index, {
                      nominal_value: number(event.target.value),
                      value_basis: 'mol_fraction',
                    })
                  }
                />
                {alloyFractionInvalid(component.nominal_value) ? (
                  <p className="text-destructive text-sm">
                    请填写大于 0 且小于 1 的目标摩尔分数。
                  </p>
                ) : null}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() =>
              setAlloyRelations([
                ...alloyRelations,
                {
                  relation_type: 'solid_solution_component',
                  host_region_key: 'film',
                  species: '',
                  value_basis: 'mol_fraction',
                },
              ])
            }
          >
            <Plus data-icon="inline-start" />
            添加组分
          </Button>
          {phaseSelect(
            region,
            0,
            undefined,
            alloyRelations.map((component) => component.species),
          )}
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">目标材料预览</p>
            <p className="mt-1 font-medium">
              {region.formula
                ? [
                    region.target_bulk_phase,
                    formatChemicalFormula(region.formula),
                  ]
                    .filter(Boolean)
                    .join('-')
                : '请填写有效组分并使摩尔分数总和为 1'}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {target.material_regions.map((materialRegion, index) => (
            <div
              key={materialRegion.region_key}
              className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
            >
              <div className="flex items-center justify-between gap-3 sm:col-span-2">
                <p className="font-medium">
                  {kindValue === 'vertical'
                    ? `材料 ${index + 1}${index === 0 ? '（靠近衬底）' : ''}`
                    : `区域 ${String.fromCharCode(65 + index)}`}
                </p>
                <div className="flex flex-wrap gap-1">
                  {kindValue === 'vertical' ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={disabled || index === 0}
                        onClick={() => moveRegion(index, -1)}
                      >
                        <ArrowUp />
                        上移
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={
                          disabled ||
                          index === target.material_regions.length - 1
                        }
                        onClick={() => moveRegion(index, 1)}
                      >
                        <ArrowDown />
                        下移
                      </Button>
                    </>
                  ) : null}
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
              </div>
              <div
                className="flex flex-col gap-2"
                data-invalid={
                  formulaInvalid(materialRegion.formula) || undefined
                }
              >
                <Label>
                  材料化学式 <RequiredMark />
                </Label>
                <FormulaInput
                  value={materialRegion.formula}
                  disabled={disabled}
                  placeholder="例如 MoS2"
                  required
                  showErrors={showErrors}
                  onChange={(value) => updateFormula(index, value)}
                />
              </div>
              <div>{phaseSelect(materialRegion, index)}</div>
              {kindValue === 'vertical' ? (
                <div className="flex flex-col gap-2">
                  <Label>目标层数</Label>
                  <Input
                    type="number"
                    min="1"
                    value={materialRegion.target_layer_count ?? ''}
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
                          target_layer_count:
                            target.material_regions[0]?.target_layer_count,
                        }),
                  },
                ],
              })
            }}
          >
            <Plus data-icon="inline-start" />
            {kindValue === 'vertical' ? '添加材料' : '添加区域'}
          </Button>
          {kindValue === 'lateral' ? (
            <div className="flex flex-col gap-2">
              <Label>整体目标层数</Label>
              <Input
                type="number"
                min="1"
                step="1"
                value={target.material_regions[0]?.target_layer_count ?? ''}
                disabled={disabled}
                onChange={(event) => {
                  const targetLayerCount = number(event.target.value)
                  onChange({
                    ...target,
                    material_regions: target.material_regions.map((item) => ({
                      ...item,
                      target_layer_count: targetLayerCount,
                    })),
                  })
                }}
              />
            </div>
          ) : null}
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">目标材料预览</p>
            <p className="mt-1 font-medium">
              {targetSummary(target) || '请填写目标材料'}
            </p>
          </div>
        </div>
      )}

      <datalist id="target-element-symbols">
        {ELEMENT_SYMBOLS.map((element) => (
          <option key={element} value={element} />
        ))}
      </datalist>
      {moreInformation}
    </ModuleCard>
  )
}

function newIngredient(): SimpleIngredient {
  return {
    material_lot_id: '',
    material_lot_version: 0,
  }
}

function newLoad(): SimpleSourceLoad {
  return {
    load_key: key('load'),
    loading_method: '',
    preparation_steps: [],
    position_program: [],
    substrate_source_ids: [],
    ingredients: [newIngredient()],
  }
}

const positionedLoadingMethods = new Set(['boat', 'crucible', 'other'])

export function requiresPrecursorPosition(loadingMethod: string) {
  return positionedLoadingMethods.has(loadingMethod)
}

function treatmentStepsForEditor(
  steps: SimpleSourceLoad['preparation_steps'],
): TreatmentStep[] {
  return normalizeTreatmentSteps(
    steps.map((step) => ({
      type: step.step_type as TreatmentType,
      other_name:
        typeof step.parameters.other_name === 'string'
          ? step.parameters.other_name
          : undefined,
      parameters: Object.fromEntries(
        Object.entries(step.parameters).filter(
          ([parameterKey]) => parameterKey !== 'other_name',
        ),
      ) as TreatmentStep['parameters'],
    })),
  )
}

function treatmentStepsForPayload(
  steps: TreatmentStep[],
): SimpleSourceLoad['preparation_steps'] {
  return steps.map((step, index) => ({
    step_type: step.type,
    sequence: index + 1,
    parameters:
      step.type === 'other' && step.other_name?.trim()
        ? { ...step.parameters, other_name: step.other_name.trim() }
        : step.parameters,
  }))
}

export function sourcePreparationStepsAreValid(
  steps: SimpleSourceLoad['preparation_steps'],
  loadingMethod?: string,
) {
  if (
    loadingMethod &&
    steps.some(
      (step) =>
        !sourceTreatmentTypesFor(loadingMethod).includes(
          step.step_type as never,
        ),
    )
  )
    return false
  return treatmentStepsAreValid('source_load', treatmentStepsForEditor(steps))
}

export function sourceSolutionMode(
  steps: SimpleSourceLoad['preparation_steps'],
) {
  const types = new Set(steps.map((step) => step.step_type))
  return {
    hasSolution: ['spin_coat', 'drop_cast', 'dip_coat'].some((type) =>
      types.has(type),
    ),
    concentrationRequired: types.has('drop_cast') || types.has('dip_coat'),
    volumeRequired: types.has('drop_cast'),
    immersionOnly:
      types.has('dip_coat') &&
      !types.has('drop_cast') &&
      !types.has('spin_coat'),
  }
}

export function SimpleSourceLoadsEditor({
  loads,
  substrates = [],
  zoneCount,
  disabled,
  showErrors,
  onChange,
}: {
  loads: SimpleSourceLoad[]
  substrates?: ModuleValues[]
  zoneCount: number | null
  disabled: boolean
  showErrors?: boolean
  onChange: (loads: SimpleSourceLoad[]) => void
}) {
  const { t } = useTranslation()
  const substrateSourceIds = new Set(
    substrates
      .map((substrate) => moduleValueAsString(substrate['source_id']))
      .filter(Boolean),
  )
  const update = (index: number, load: SimpleSourceLoad) =>
    onChange(loads.map((item, current) => (current === index ? load : item)))

  return (
    <ModuleCard id="module-precursors" title="前驱体装载">
      <div className="flex flex-col gap-5">
        {loads.length === 0 ? (
          <EmptyState
            description="尚未添加前驱体；本步骤至少需要一处前驱体装载。"
            action={
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange([newLoad()])}
              >
                <Plus data-icon="inline-start" />
                添加前驱体
              </Button>
            }
          />
        ) : null}
        {loads.map((load, loadIndex) => {
          const requiresPosition = requiresPrecursorPosition(
            load.loading_method,
          )
          const loadingInvalid = Boolean(showErrors && !load.loading_method)
          const zoneInvalid = Boolean(
            showErrors &&
            requiresPosition &&
            (!load.heating_zone_ref ||
              Number(load.heating_zone_ref.replace('zone_', '')) < 1 ||
              Number(load.heating_zone_ref.replace('zone_', '')) >
                (zoneCount ?? 0)),
          )
          const positionInvalid = Boolean(
            showErrors &&
            requiresPosition &&
            (!Number.isFinite(load.initial_position?.axial_mm) ||
              load.initial_position?.reference !== 'zone_thermocouple'),
          )
          const positionHelpId = `precursor-position-help-${load.load_key}`
          const isSubstrateSurface = load.loading_method === 'substrate_surface'
          const substrateInvalid = Boolean(
            showErrors &&
            isSubstrateSurface &&
            ((load.substrate_source_ids ?? []).length === 0 ||
              (load.substrate_source_ids ?? []).some(
                (sourceId) => !substrateSourceIds.has(sourceId),
              )),
          )
          const isGasLine = load.loading_method === 'gas_line'
          const {
            hasSolution,
            concentrationRequired,
            volumeRequired,
            immersionOnly,
          } = sourceSolutionMode(load.preparation_steps)
          const amountRequired = !isGasLine && !immersionOnly
          return (
            <div
              key={load.load_key}
              className="flex flex-col gap-4 rounded-lg border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">前驱体装载 {loadIndex + 1}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      loads.filter((_, current) => current !== loadIndex),
                    )
                  }
                >
                  <Trash2 data-icon="inline-start" />
                  删除装载
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div
                  className="flex flex-col gap-2"
                  data-invalid={loadingInvalid || undefined}
                >
                  <Label>
                    装载方式 <RequiredMark />
                  </Label>
                  <Select
                    value={load.loading_method}
                    disabled={disabled}
                    onValueChange={(value) => {
                      const changesGasMode =
                        isGasLine !== (value === 'gas_line')
                      update(loadIndex, {
                        ...load,
                        loading_method: value,
                        attrs: {
                          ...load.attrs,
                          loading_other:
                            value === 'other'
                              ? load.attrs?.loading_other
                              : undefined,
                        },
                        preparation_steps: load.preparation_steps
                          .filter((step) =>
                            sourceTreatmentTypesFor(value).includes(
                              step.step_type as never,
                            ),
                          )
                          .map((step, index) => ({
                            ...step,
                            sequence: index + 1,
                          })),
                        heating_zone_ref: requiresPrecursorPosition(value)
                          ? load.heating_zone_ref
                          : undefined,
                        initial_position: requiresPrecursorPosition(value)
                          ? load.initial_position
                          : undefined,
                        position_program: requiresPrecursorPosition(value)
                          ? load.position_program
                          : [],
                        substrate_source_ids:
                          value === 'substrate_surface'
                            ? (load.substrate_source_ids ?? [])
                            : [],
                        ingredients: changesGasMode
                          ? [newIngredient()]
                          : load.ingredients.map((ingredient) =>
                              value === 'substrate_surface'
                                ? ingredient
                                : {
                                    ...ingredient,
                                    concentration_value: undefined,
                                    concentration_unit: undefined,
                                    concentration_unit_other: undefined,
                                  },
                            ),
                      })
                    }}
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={loadingInvalid || undefined}
                    >
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="boat">舟</SelectItem>
                        <SelectItem value="crucible">坩埚</SelectItem>
                        <SelectItem value="substrate_surface">衬底</SelectItem>
                        <SelectItem value="gas_line">气路供给</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {loadingInvalid ? (
                    <p className="text-destructive text-sm">请选择装载方式。</p>
                  ) : null}
                  {load.loading_method === 'other' ? (
                    <>
                      <Label htmlFor={`${load.load_key}-loading-other`}>
                        其他装载方式 <RequiredMark />
                      </Label>
                      <Input
                        id={`${load.load_key}-loading-other`}
                        value={String(load.attrs?.loading_other ?? '')}
                        disabled={disabled}
                        aria-invalid={
                          (showErrors &&
                            !String(load.attrs?.loading_other ?? '').trim()) ||
                          undefined
                        }
                        onChange={(event) =>
                          update(loadIndex, {
                            ...load,
                            attrs: {
                              ...load.attrs,
                              loading_other: event.target.value,
                            },
                          })
                        }
                      />
                    </>
                  ) : null}
                </div>
                {requiresPosition ? (
                  <>
                    <div
                      className="flex flex-col gap-2"
                      data-invalid={zoneInvalid || undefined}
                    >
                      <Label>
                        所在温区 <RequiredMark />
                      </Label>
                      <Select
                        value={load.heating_zone_ref ?? ''}
                        disabled={disabled || !zoneCount}
                        onValueChange={(value) =>
                          update(loadIndex, {
                            ...load,
                            heating_zone_ref: value,
                          })
                        }
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-invalid={zoneInvalid || undefined}
                        >
                          <SelectValue
                            placeholder={
                              zoneCount ? '请选择温区' : '请先选择实验装置'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {Array.from(
                              { length: zoneCount ?? 0 },
                              (_, index) => (
                                <SelectItem
                                  key={index}
                                  value={`zone_${index + 1}`}
                                >
                                  温区 {index + 1}
                                </SelectItem>
                              ),
                            )}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {zoneInvalid ? (
                        <p className="text-destructive text-sm">
                          请选择所在温区。
                        </p>
                      ) : null}
                    </div>
                    <div
                      className="flex flex-col gap-2"
                      data-invalid={positionInvalid || undefined}
                    >
                      <Label>
                        相对测温点位置（mm） <RequiredMark />
                      </Label>
                      <Input
                        type="number"
                        step="any"
                        placeholder="例如 -20"
                        aria-describedby={positionHelpId}
                        aria-invalid={positionInvalid || undefined}
                        value={load.initial_position?.axial_mm ?? ''}
                        disabled={disabled || !load.heating_zone_ref}
                        onChange={(event) =>
                          update(loadIndex, {
                            ...load,
                            initial_position:
                              event.target.value.trim() === ''
                                ? undefined
                                : {
                                    axial_mm: Number(event.target.value),
                                    reference: 'zone_thermocouple',
                                  },
                          })
                        }
                      />
                      {positionInvalid ? (
                        <p className="text-destructive text-sm">
                          请填写相对于所选温区测温点的位置。
                        </p>
                      ) : null}
                    </div>
                    <p
                      id={positionHelpId}
                      className="text-muted-foreground text-sm sm:col-span-2"
                    >
                      {
                        '相对于所选温区的测温点位置：以测温点为 0 mm；沿气流方向，上游填负值，下游填正值。'
                      }
                    </p>
                    {load.initial_position?.reference === 'setup_origin' ? (
                      <p className="text-destructive text-sm sm:col-span-2">
                        此记录使用旧装置原点参照；请按当前规则重新确认温区和相对测温点位置。
                      </p>
                    ) : null}
                  </>
                ) : null}
                {isSubstrateSurface ? (
                  <fieldset
                    className="flex flex-col gap-3 rounded-md border p-3 sm:col-span-3"
                    data-invalid={substrateInvalid || undefined}
                  >
                    <legend className="px-1 text-sm font-medium">
                      关联衬底片 <RequiredMark />
                    </legend>
                    {substrates.length ? (
                      substrates.map((substrate, index) => {
                        const sourceId = moduleValueAsString(
                          substrate['source_id'],
                        )
                        const position = parsedObject(
                          substrate['zone_thermocouple_distance_mm'],
                        )
                        const checked = (
                          load.substrate_source_ids ?? []
                        ).includes(sourceId)
                        return (
                          <Label
                            key={sourceId || index}
                            className="flex items-start gap-3 rounded-md border p-3"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={disabled || !sourceId}
                              aria-invalid={substrateInvalid || undefined}
                              onCheckedChange={(value) =>
                                update(loadIndex, {
                                  ...load,
                                  substrate_source_ids:
                                    value === true
                                      ? [
                                          ...(load.substrate_source_ids ?? []),
                                          sourceId,
                                        ]
                                      : (
                                          load.substrate_source_ids ?? []
                                        ).filter((id) => id !== sourceId),
                                })
                              }
                            />
                            <span className="flex flex-col gap-1">
                              <span>
                                衬底片 {index + 1}（
                                {moduleValueAsString(
                                  substrate['piece_label'],
                                ) || `S${index + 1}`}
                                ）
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {position.zone_index
                                  ? `温区 ${position.zone_index}，相对测温点 ${position.distance_mm ?? '—'} mm`
                                  : '请先补齐该衬底片的温区与位置'}
                              </span>
                            </span>
                          </Label>
                        )
                      })
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        请先在上一步添加衬底片。
                      </p>
                    )}
                    {substrateInvalid ? (
                      <p className="text-destructive text-sm">
                        请至少选择一片当前衬底；如关联的衬底已删除，请重新选择。
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
                {!isGasLine ? (
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label>处理方式</Label>
                    <TreatmentStepsEditor
                      kind="source_load"
                      allowedTypes={sourceTreatmentTypesFor(
                        load.loading_method,
                      )}
                      value={treatmentStepsForEditor(load.preparation_steps)}
                      disabled={disabled}
                      showErrors={showErrors}
                      labels={buildTreatmentStepsEditorLabels(t)}
                      onChange={(steps) => {
                        const preparationSteps = treatmentStepsForPayload(steps)
                        const nextMode = sourceSolutionMode(preparationSteps)
                        update(loadIndex, {
                          ...load,
                          preparation_steps: preparationSteps,
                          ingredients: load.ingredients.map((ingredient) => ({
                            ...ingredient,
                            ...(nextMode.hasSolution
                              ? {}
                              : {
                                  concentration_value: undefined,
                                  concentration_unit: undefined,
                                  concentration_unit_other: undefined,
                                }),
                            ...(nextMode.immersionOnly
                              ? { amount: undefined, unit: undefined }
                              : {}),
                          })),
                        })
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <Separator />
              <div className="flex flex-col gap-4">
                {load.ingredients.map((ingredient, ingredientIndex) => {
                  const duplicateLot = load.ingredients.some(
                    (item, current) =>
                      current !== ingredientIndex &&
                      Boolean(ingredient.material_lot_id) &&
                      item.material_lot_id === ingredient.material_lot_id,
                  )
                  const lotInvalid = Boolean(
                    showErrors && (!ingredient.material_lot_id || duplicateLot),
                  )
                  const amountInvalid = Boolean(
                    showErrors &&
                    amountRequired &&
                    (!Number.isFinite(ingredient.amount) ||
                      Number(ingredient.amount) <= 0),
                  )
                  const unitInvalid = Boolean(
                    showErrors &&
                    amountRequired &&
                    (!ingredient.unit?.trim() ||
                      (volumeRequired &&
                        !['μL', 'µL', 'uL', 'mL', 'L'].includes(
                          ingredient.unit,
                        ))),
                  )
                  const hasConcentration =
                    ingredient.concentration_value !== undefined ||
                    Boolean(ingredient.concentration_unit) ||
                    Boolean(ingredient.concentration_unit_other?.trim())
                  const concentrationValueInvalid = Boolean(
                    showErrors &&
                    hasSolution &&
                    (hasConcentration || concentrationRequired) &&
                    !(Number(ingredient.concentration_value) > 0),
                  )
                  const concentrationUnitInvalid = Boolean(
                    showErrors &&
                    hasSolution &&
                    (hasConcentration || concentrationRequired) &&
                    (!ingredient.concentration_unit ||
                      !CONCENTRATION_UNIT_CODES.has(
                        ingredient.concentration_unit,
                      )),
                  )
                  const concentrationOtherInvalid = Boolean(
                    showErrors &&
                    hasSolution &&
                    ingredient.concentration_unit === 'other' &&
                    !ingredient.concentration_unit_other?.trim(),
                  )
                  const unitInputId = `${load.load_key}-ingredient-${ingredientIndex}-unit`
                  const concentrationValueId = `${load.load_key}-ingredient-${ingredientIndex}-concentration`
                  const concentrationUnitId = `${load.load_key}-ingredient-${ingredientIndex}-concentration-unit`
                  const concentrationUnitOtherId = `${load.load_key}-ingredient-${ingredientIndex}-concentration-unit-other`
                  return (
                    <div
                      key={ingredientIndex}
                      className="grid gap-4 sm:grid-cols-2"
                    >
                      <div
                        className="flex flex-col gap-2 sm:col-span-2"
                        data-invalid={lotInvalid || undefined}
                      >
                        <Label>
                          物料批次 <RequiredMark />
                        </Label>
                        <EntityReferenceSelect
                          kind="material_lot"
                          productLabel
                          value={ingredient.material_lot_id}
                          selectedVersion={ingredient.material_lot_version}
                          selectedSnapshot={ingredient.snapshot}
                          disabled={disabled}
                          allowedLotCategories={[
                            isGasLine ? 'gas_cylinder' : 'chemical',
                          ]}
                          filter={(entity) =>
                            !load.ingredients.some(
                              (item, current) =>
                                current !== ingredientIndex &&
                                item.material_lot_id === entity.id,
                            )
                          }
                          onChange={(id, entity) =>
                            update(loadIndex, {
                              ...load,
                              ingredients: load.ingredients.map(
                                (item, current) =>
                                  current === ingredientIndex
                                    ? {
                                        ...item,
                                        material_lot_id: id,
                                        material_lot_version:
                                          entity?.latest_version?.version ?? 0,
                                        snapshot:
                                          entity?.latest_version?.data ??
                                          undefined,
                                      }
                                    : item,
                              ),
                            })
                          }
                        />
                        {lotInvalid ? (
                          <p className="text-destructive text-sm">
                            {duplicateLot
                              ? '同一容器中不能重复添加同一物料批次。'
                              : '请选择物料批次。'}
                          </p>
                        ) : null}
                      </div>
                      {amountRequired ? (
                        <div className="grid grid-cols-2 gap-3">
                          <div
                            className="flex flex-col gap-2"
                            data-invalid={amountInvalid || undefined}
                          >
                            <Label>
                              {volumeRequired ? '滴加体积' : '用量'}{' '}
                              <RequiredMark />
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              value={ingredient.amount ?? ''}
                              disabled={disabled}
                              aria-invalid={amountInvalid || undefined}
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
                            {amountInvalid ? (
                              <p className="text-destructive text-sm">
                                请填写大于 0 的用量。
                              </p>
                            ) : null}
                          </div>
                          <div
                            className="flex flex-col gap-2"
                            data-invalid={unitInvalid || undefined}
                          >
                            <Label htmlFor={unitInputId}>
                              单位 <RequiredMark />
                            </Label>
                            <Input
                              id={unitInputId}
                              list={`${unitInputId}-options`}
                              value={ingredient.unit ?? ''}
                              disabled={disabled}
                              placeholder="选择或输入单位"
                              aria-invalid={unitInvalid || undefined}
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
                            <datalist id={`${unitInputId}-options`}>
                              {(volumeRequired
                                ? ['μL', 'mL']
                                : AMOUNT_UNITS
                              ).map((unit) => (
                                <option key={unit} value={unit} />
                              ))}
                            </datalist>
                            {unitInvalid ? (
                              <p className="text-destructive text-sm">
                                {volumeRequired
                                  ? '请使用体积单位（μL、mL 或 L）。'
                                  : '请填写用量单位。'}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                      {hasSolution ? (
                        <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                          <div
                            className="flex flex-col gap-2"
                            data-invalid={
                              concentrationValueInvalid || undefined
                            }
                          >
                            <Label htmlFor={concentrationValueId}>
                              溶液浓度{' '}
                              {hasConcentration || concentrationRequired ? (
                                <RequiredMark />
                              ) : null}
                            </Label>
                            <Input
                              id={concentrationValueId}
                              type="number"
                              min="0"
                              step="any"
                              value={ingredient.concentration_value ?? ''}
                              disabled={disabled}
                              aria-invalid={
                                concentrationValueInvalid || undefined
                              }
                              onChange={(event) => {
                                const value = number(event.target.value)
                                update(loadIndex, {
                                  ...load,
                                  ingredients: load.ingredients.map(
                                    (item, current) =>
                                      current === ingredientIndex
                                        ? {
                                            ...item,
                                            concentration_value: value,
                                            concentration_unit:
                                              value === undefined
                                                ? undefined
                                                : item.concentration_unit,
                                            concentration_unit_other:
                                              value === undefined
                                                ? undefined
                                                : item.concentration_unit_other,
                                          }
                                        : item,
                                  ),
                                })
                              }}
                            />
                            {concentrationValueInvalid ? (
                              <p className="text-destructive text-sm">
                                浓度数值必须大于 0。
                              </p>
                            ) : null}
                          </div>
                          <div
                            className="flex flex-col gap-2"
                            data-invalid={concentrationUnitInvalid || undefined}
                          >
                            <Label htmlFor={concentrationUnitId}>
                              浓度单位{' '}
                              {hasConcentration || concentrationRequired ? (
                                <RequiredMark />
                              ) : null}
                            </Label>
                            <Select
                              value={ingredient.concentration_unit ?? ''}
                              disabled={disabled}
                              onValueChange={(value) =>
                                update(loadIndex, {
                                  ...load,
                                  ingredients: load.ingredients.map(
                                    (item, current) =>
                                      current === ingredientIndex
                                        ? {
                                            ...item,
                                            concentration_unit: value,
                                            concentration_unit_other:
                                              value === 'other'
                                                ? item.concentration_unit_other
                                                : undefined,
                                          }
                                        : item,
                                  ),
                                })
                              }
                            >
                              <SelectTrigger
                                id={concentrationUnitId}
                                className="w-full"
                                aria-invalid={
                                  concentrationUnitInvalid || undefined
                                }
                              >
                                <SelectValue placeholder="请选择单位" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {CONCENTRATION_UNITS.map(([value, label]) => (
                                    <SelectItem key={value} value={value}>
                                      {label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            {concentrationUnitInvalid ? (
                              <p className="text-destructive text-sm">
                                填写浓度后，请选择单位。
                              </p>
                            ) : null}
                          </div>
                          {ingredient.concentration_unit === 'other' ? (
                            <div
                              className="flex flex-col gap-2 sm:col-span-2"
                              data-invalid={
                                concentrationOtherInvalid || undefined
                              }
                            >
                              <Label htmlFor={concentrationUnitOtherId}>
                                其他浓度单位 <RequiredMark />
                              </Label>
                              <Input
                                id={concentrationUnitOtherId}
                                value={
                                  ingredient.concentration_unit_other ?? ''
                                }
                                disabled={disabled}
                                aria-invalid={
                                  concentrationOtherInvalid || undefined
                                }
                                onChange={(event) =>
                                  update(loadIndex, {
                                    ...load,
                                    ingredients: load.ingredients.map(
                                      (item, current) =>
                                        current === ingredientIndex
                                          ? {
                                              ...item,
                                              concentration_unit_other:
                                                event.target.value,
                                            }
                                          : item,
                                    ),
                                  })
                                }
                              />
                              {concentrationOtherInvalid ? (
                                <p className="text-destructive text-sm">
                                  请说明其他浓度单位。
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
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
                  )
                })}
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
                  添加另一种物料
                </Button>
              </div>
            </div>
          )
        })}
        {loads.length ? (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onChange([...loads, newLoad()])}
          >
            <Plus data-icon="inline-start" />
            添加另一处装载
          </Button>
        ) : null}
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
    ...emptySubstrateValues(),
    source_id: crypto.randomUUID(),
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

function substrateTreatmentSteps(item: ModuleValues): TreatmentStep[] | null {
  try {
    const parsed: unknown = JSON.parse(
      moduleValueAsString(item['pretreatment_steps']) || '[]',
    )
    return Array.isArray(parsed) ? (parsed as TreatmentStep[]) : null
  } catch {
    return null
  }
}

const substratePlacementTypes = new Set([
  'face_up',
  'face_down',
  'tilted',
  'upright',
  'other',
])
const uprightGrowthFaceDirections = new Set([
  'downstream',
  'upstream',
  'tube_left',
  'tube_right',
])

export function simpleSubstrateIsValid(
  item: ModuleValues,
  zoneCount: number | null,
): boolean {
  const placement = parsedObject(item['size_placement'])
  const position = parsedObject(item['zone_thermocouple_distance_mm'])
  const treatmentSteps = substrateTreatmentSteps(item)
  const thickness = placement.thickness_mm
  const placementType = String(placement.placement ?? '')
  const zoneIndex = Number(position.zone_index)
  return Boolean(
    moduleValueAsString(item['lot_ref']) &&
    Number(placement.length_mm) > 0 &&
    Number(placement.width_mm) > 0 &&
    Number(placement.length_mm) >= Number(placement.width_mm) &&
    (thickness === undefined ||
      thickness === null ||
      (Number.isFinite(Number(thickness)) && Number(thickness) > 0)) &&
    zoneCount &&
    Number.isInteger(zoneIndex) &&
    zoneIndex >= 1 &&
    zoneIndex <= zoneCount &&
    position.distance_mm !== undefined &&
    position.distance_mm !== null &&
    Number.isFinite(Number(position.distance_mm)) &&
    substratePlacementTypes.has(placementType) &&
    (placementType !== 'tilted' ||
      (Number(placement.tilt_angle_deg) > -90 &&
        Number(placement.tilt_angle_deg) !== 0 &&
        Number(placement.tilt_angle_deg) < 90 &&
        Number(placement.tilt_azimuth_deg) >= 0 &&
        Number(placement.tilt_azimuth_deg) < 360)) &&
    (placementType !== 'upright' ||
      uprightGrowthFaceDirections.has(
        String(placement.upright_growth_face_direction ?? ''),
      )) &&
    (placementType !== 'other' ||
      String(placement.placement_other ?? '').trim()) &&
    treatmentSteps &&
    treatmentStepsAreValid('substrate', treatmentSteps),
  )
}

export function simpleSubstrateRelationsAreValid(
  substrates: ModuleValues[],
  relations: SubstratePlacementRelation[],
): boolean {
  const pieceLabels = substrates.map((item) =>
    moduleValueAsString(item['piece_label']),
  )
  const labels = new Set(pieceLabels)
  if (labels.size !== pieceLabels.length) return false
  const pairs = new Set<string>()
  return relations.every((relation) => {
    const pair = [relation.piece_a_label, relation.piece_b_label].sort()
    const pairKey = pair.join('\u0000')
    const valid =
      labels.has(relation.piece_a_label) &&
      labels.has(relation.piece_b_label) &&
      relation.piece_a_label !== relation.piece_b_label &&
      !pairs.has(pairKey) &&
      (relation.gap_mm == null ||
        (Number.isFinite(Number(relation.gap_mm)) &&
          Number(relation.gap_mm) >= 0))
    pairs.add(pairKey)
    return valid
  })
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

function substrateOrientationSummary(value: string) {
  return value
    .split(/[；;]/)
    .map((part) => localizedOption(part.trim(), 'zh'))
    .join('；')
}

export function SimpleSubstratesEditor({
  substrates,
  placementRelations,
  zoneCount,
  disabled,
  showErrors,
  onChange,
  onPlacementRelationsChange,
}: {
  substrates: ModuleValues[]
  placementRelations: SubstratePlacementRelation[]
  zoneCount: number | null
  disabled: boolean
  showErrors?: boolean
  onChange: (substrates: ModuleValues[]) => void
  onPlacementRelationsChange: (relations: SubstratePlacementRelation[]) => void
}) {
  const { t } = useTranslation()
  const update = (index: number, patch: ModuleValues) =>
    onChange(
      substrates.map((item, current) =>
        current === index ? { ...item, ...patch } : item,
      ),
    )
  const pieceLabels = substrates.map(
    (item, index) =>
      moduleValueAsString(item['piece_label']) || `S${index + 1}`,
  )
  const usedRelationPairs = new Set(
    placementRelations.map((relation) =>
      [relation.piece_a_label, relation.piece_b_label].sort().join('\u0000'),
    ),
  )
  const availableRelationPair = pieceLabels
    .flatMap((pieceA, index) =>
      pieceLabels.slice(index + 1).map((pieceB) => [pieceA, pieceB] as const),
    )
    .find((pair) => !usedRelationPairs.has([...pair].sort().join('\u0000')))
  const removeSubstrate = (index: number) => {
    const removedLabel = pieceLabels[index]
    const retained = substrates.filter((_, current) => current !== index)
    const labelMap = new Map(
      retained.map((item, current) => [
        moduleValueAsString(item['piece_label']) || `S${current + 1}`,
        `S${current + 1}`,
      ]),
    )
    onChange(
      retained.map((item, current) => ({
        ...item,
        piece_label: `S${current + 1}`,
      })),
    )
    onPlacementRelationsChange(
      placementRelations
        .filter(
          (relation) =>
            relation.piece_a_label !== removedLabel &&
            relation.piece_b_label !== removedLabel,
        )
        .map((relation) => ({
          ...relation,
          piece_a_label:
            labelMap.get(relation.piece_a_label) ?? relation.piece_a_label,
          piece_b_label:
            labelMap.get(relation.piece_b_label) ?? relation.piece_b_label,
        })),
    )
  }

  return (
    <ModuleCard id="module-substrates" title="衬底与放置">
      <div className="flex flex-col gap-5">
        {substrates.length === 0 ? (
          <EmptyState
            description="尚未添加衬底片；本步骤至少需要一片衬底。"
            action={
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange([newSubstrate(0)])}
              >
                <Plus data-icon="inline-start" />
                添加衬底片
              </Button>
            }
          />
        ) : null}
        {substrates.map((item, index) => {
          const reference = substrateReference(item)
          const placement = parsedObject(item['size_placement'])
          const position = parsedObject(item['zone_thermocouple_distance_mm'])
          const treatmentSteps = substrateTreatmentSteps(item)
          const placementMode = String(placement.placement ?? '')
          const pieceLabel =
            moduleValueAsString(item['piece_label']) || `S${index + 1}`
          const lengthInvalid = Boolean(
            showErrors && !(Number(placement.length_mm) > 0),
          )
          const widthInvalid = Boolean(
            showErrors &&
            (!(Number(placement.width_mm) > 0) ||
              Number(placement.width_mm) > Number(placement.length_mm)),
          )
          const thicknessInvalid = Boolean(
            showErrors &&
            placement.thickness_mm != null &&
            (!Number.isFinite(Number(placement.thickness_mm)) ||
              Number(placement.thickness_mm) <= 0),
          )
          const zoneIndex = Number(position.zone_index)
          const zoneInvalid = Boolean(
            showErrors &&
            (!zoneCount ||
              !Number.isInteger(zoneIndex) ||
              zoneIndex < 1 ||
              zoneIndex > zoneCount),
          )
          const positionValue =
            position.distance_mm === undefined || position.distance_mm === null
              ? ''
              : String(position.distance_mm)
          const positionInvalid = Boolean(
            showErrors &&
            (positionValue === '' ||
              !Number.isFinite(Number(position.distance_mm))),
          )
          const tiltInvalid = Boolean(
            showErrors &&
            placementMode === 'tilted' &&
            (!Number.isFinite(Number(placement.tilt_angle_deg)) ||
              Number(placement.tilt_angle_deg) <= -90 ||
              Number(placement.tilt_angle_deg) === 0 ||
              Number(placement.tilt_angle_deg) >= 90),
          )
          const tiltAzimuthInvalid = Boolean(
            showErrors &&
            placementMode === 'tilted' &&
            (!(Number(placement.tilt_azimuth_deg) >= 0) ||
              Number(placement.tilt_azimuth_deg) >= 360),
          )
          const uprightDirectionInvalid = Boolean(
            showErrors &&
            placementMode === 'upright' &&
            !uprightGrowthFaceDirections.has(
              String(placement.upright_growth_face_direction ?? ''),
            ),
          )
          const otherPlacementInvalid = Boolean(
            showErrors &&
            placementMode === 'other' &&
            !String(placement.placement_other ?? '').trim(),
          )
          const placementInvalid = Boolean(
            showErrors && !substratePlacementTypes.has(placementMode),
          )
          const positionHelpId = `substrate-position-help-${pieceLabel}`
          return (
            <div
              key={moduleValueAsString(item['piece_label']) || index}
              className="flex flex-col gap-4 rounded-lg border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">
                  衬底片 {index + 1}（{pieceLabel}）
                </p>
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
                          source_id: crypto.randomUUID(),
                          axial_position_mm: '',
                          zone_thermocouple_distance_mm: '',
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
                    onClick={() => removeSubstrate(index)}
                  >
                    <Trash2 data-icon="inline-start" />
                    删除本片
                  </Button>
                </div>
              </div>
              <div
                className="flex flex-col gap-2"
                data-invalid={
                  (showErrors && !reference?.entity_id) || undefined
                }
              >
                <Label>
                  衬底批次 <RequiredMark />
                </Label>
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
                      ...materialLotProjection(snapshot),
                    })
                  }}
                />
                {showErrors && !reference?.entity_id ? (
                  <p className="text-destructive text-sm">请选择衬底批次。</p>
                ) : null}
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
                <div
                  className="flex flex-col gap-2"
                  data-invalid={lengthInvalid || undefined}
                >
                  <Label>
                    长边（mm） <RequiredMark />
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={String(placement.length_mm ?? '')}
                    disabled={disabled}
                    aria-invalid={lengthInvalid || undefined}
                    onChange={(event) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          length_mm: number(event.target.value),
                        }),
                      })
                    }
                  />
                  {lengthInvalid ? (
                    <p className="text-destructive text-sm">
                      请填写大于 0 的长边。
                    </p>
                  ) : null}
                </div>
                <div
                  className="flex flex-col gap-2"
                  data-invalid={widthInvalid || undefined}
                >
                  <Label>
                    短边（mm） <RequiredMark />
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={String(placement.width_mm ?? '')}
                    disabled={disabled}
                    aria-invalid={widthInvalid || undefined}
                    onChange={(event) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          width_mm: number(event.target.value),
                        }),
                      })
                    }
                  />
                  {widthInvalid ? (
                    <p className="text-destructive text-sm">
                      请填写大于 0 且不大于长边的短边。
                    </p>
                  ) : null}
                </div>
                <div
                  className="flex flex-col gap-2"
                  data-invalid={thicknessInvalid || undefined}
                >
                  <Label>厚度（mm）</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    value={String(placement.thickness_mm ?? '')}
                    disabled={disabled}
                    aria-invalid={thicknessInvalid || undefined}
                    onChange={(event) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          thickness_mm: number(event.target.value),
                        }),
                      })
                    }
                  />
                  {thicknessInvalid ? (
                    <p className="text-destructive text-sm">
                      厚度如填写，必须大于 0。
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2">
                  <Label>晶向与抛光</Label>
                  <p className="min-h-9 rounded-md border bg-muted px-3 py-2 text-sm">
                    {substrateOrientationSummary(
                      moduleValueAsString(item['crystal_orientation']),
                    ) || (reference ? '批次未记录' : '—')}
                  </p>
                </div>
                <div
                  className="flex flex-col gap-2"
                  data-invalid={zoneInvalid || undefined}
                >
                  <Label>
                    所在温区 <RequiredMark />
                  </Label>
                  <Select
                    value={position.zone_index ? String(zoneIndex) : ''}
                    disabled={disabled || !zoneCount}
                    onValueChange={(value) =>
                      update(index, {
                        axial_position_mm: '',
                        zone_thermocouple_distance_mm: jsonValue({
                          ...position,
                          zone_index: Number(value),
                        }),
                      })
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={zoneInvalid || undefined}
                    >
                      <SelectValue
                        placeholder={
                          zoneCount ? '请选择温区' : '请先选择实验装置'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Array.from(
                          { length: zoneCount ?? 0 },
                          (_, zonePosition) => (
                            <SelectItem
                              key={zonePosition}
                              value={String(zonePosition + 1)}
                            >
                              温区 {zonePosition + 1}
                            </SelectItem>
                          ),
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {zoneInvalid ? (
                    <p className="text-destructive text-sm">请选择所在温区。</p>
                  ) : null}
                </div>
                <div
                  className="flex flex-col gap-2"
                  data-invalid={positionInvalid || undefined}
                >
                  <Label>
                    相对测温点位置（mm） <RequiredMark />
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    placeholder="例如 -20"
                    aria-describedby={positionHelpId}
                    value={positionValue}
                    disabled={disabled || !position.zone_index}
                    aria-invalid={positionInvalid || undefined}
                    onChange={(event) =>
                      update(index, {
                        axial_position_mm: '',
                        zone_thermocouple_distance_mm: jsonValue({
                          ...position,
                          distance_mm: number(event.target.value),
                        }),
                      })
                    }
                  />
                  {positionInvalid ? (
                    <p className="text-destructive text-sm">
                      请填写相对于所选温区测温点的位置。
                    </p>
                  ) : null}
                </div>
                <p
                  id={positionHelpId}
                  className="text-muted-foreground text-sm sm:col-span-3"
                >
                  以所选温区测温点为 0 mm；上游为负，下游为正。
                </p>
                {moduleValueAsString(item['axial_position_mm']).trim() &&
                !position.zone_index ? (
                  <p className="text-destructive text-sm sm:col-span-3">
                    此记录使用旧装置原点位置；请按当前规则重新确认温区和相对测温点位置。
                  </p>
                ) : null}
                <div
                  className="flex flex-col gap-2 sm:col-span-2"
                  data-invalid={placementInvalid || undefined}
                >
                  <Label>
                    放置方式 <RequiredMark />
                  </Label>
                  <Select
                    value={placementMode}
                    disabled={disabled}
                    onValueChange={(value) =>
                      update(index, {
                        size_placement: jsonValue({
                          ...placement,
                          placement: value,
                          tilt_angle_deg:
                            value === 'tilted'
                              ? placement.tilt_angle_deg
                              : undefined,
                          tilt_azimuth_deg:
                            value === 'tilted'
                              ? placement.tilt_azimuth_deg
                              : undefined,
                          upright_growth_face_direction:
                            value === 'upright'
                              ? placement.upright_growth_face_direction
                              : undefined,
                          ...(value === 'other'
                            ? {
                                placement_other:
                                  placement.placement === 'other'
                                    ? placement.placement_other
                                    : '',
                              }
                            : { placement_other: undefined }),
                        }),
                      })
                    }
                  >
                    <SelectTrigger
                      className="w-full"
                      aria-invalid={placementInvalid || undefined}
                    >
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="face_up">
                          生长面朝上（平放）
                        </SelectItem>
                        <SelectItem value="face_down">
                          生长面朝下（倒扣）
                        </SelectItem>
                        <SelectItem value="tilted">倾斜</SelectItem>
                        <SelectItem value="upright">竖放</SelectItem>
                        <SelectItem value="other">其他</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  {placementInvalid ? (
                    <p className="text-destructive text-sm">请选择放置方式。</p>
                  ) : null}
                </div>
                {placementMode === 'tilted' ? (
                  <>
                    <div
                      className="flex flex-col gap-2"
                      data-invalid={tiltInvalid || undefined}
                    >
                      <Label>
                        倾角 α（°） <RequiredMark />
                      </Label>
                      <Input
                        type="number"
                        min="-90"
                        max="90"
                        step="any"
                        value={String(placement.tilt_angle_deg ?? '')}
                        disabled={disabled}
                        aria-invalid={tiltInvalid || undefined}
                        onChange={(event) =>
                          update(index, {
                            size_placement: jsonValue({
                              ...placement,
                              tilt_angle_deg: number(event.target.value),
                            }),
                          })
                        }
                      />
                      {tiltInvalid ? (
                        <p className="text-destructive text-sm">
                          倾角须大于 -90°、小于 90°且不为 0°。
                        </p>
                      ) : null}
                      <p className="text-muted-foreground text-sm">
                        绝对值为衬底平面与水平面的夹角；生长面朝上为正，朝下为负。
                      </p>
                    </div>
                    <div
                      className="flex flex-col gap-2"
                      data-invalid={tiltAzimuthInvalid || undefined}
                    >
                      <Label>
                        方位角 φ（°） <RequiredMark />
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        max="359.999"
                        step="any"
                        value={String(placement.tilt_azimuth_deg ?? '')}
                        disabled={disabled}
                        aria-invalid={tiltAzimuthInvalid || undefined}
                        onChange={(event) =>
                          update(index, {
                            size_placement: jsonValue({
                              ...placement,
                              tilt_azimuth_deg: number(event.target.value),
                            }),
                          })
                        }
                      />
                      {tiltAzimuthInvalid ? (
                        <p className="text-destructive text-sm">
                          请填写 0° 到小于 360° 的方位角。
                        </p>
                      ) : null}
                      <p className="text-muted-foreground text-sm">
                        生长面法向的水平投影：以下游为 0°，俯视时顺时针为正。
                      </p>
                    </div>
                  </>
                ) : null}
                {placementMode === 'upright' ? (
                  <div
                    className="flex flex-col gap-2"
                    data-invalid={uprightDirectionInvalid || undefined}
                  >
                    <Label>
                      生长面朝向 <RequiredMark />
                    </Label>
                    <Select
                      value={String(
                        placement.upright_growth_face_direction ?? '',
                      )}
                      disabled={disabled}
                      onValueChange={(value) =>
                        update(index, {
                          size_placement: jsonValue({
                            ...placement,
                            upright_growth_face_direction: value,
                          }),
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={uprightDirectionInvalid || undefined}
                      >
                        <SelectValue placeholder="请选择生长面朝向" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="downstream">朝下游</SelectItem>
                          <SelectItem value="upstream">朝上游</SelectItem>
                          <SelectItem value="tube_left">朝炉管左侧</SelectItem>
                          <SelectItem value="tube_right">朝炉管右侧</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {uprightDirectionInvalid ? (
                      <p className="text-destructive text-sm">
                        请选择竖放时的生长面朝向。
                      </p>
                    ) : null}
                    <p className="text-muted-foreground text-sm">
                      左右以面向下游时为准。
                    </p>
                  </div>
                ) : null}
                {placementMode === 'other' ? (
                  <div
                    className="flex flex-col gap-2"
                    data-invalid={otherPlacementInvalid || undefined}
                  >
                    <Label>
                      其他放置方式 <RequiredMark />
                    </Label>
                    <Input
                      value={String(placement.placement_other ?? '')}
                      disabled={disabled}
                      aria-invalid={otherPlacementInvalid || undefined}
                      onChange={(event) =>
                        update(index, {
                          size_placement: jsonValue({
                            ...placement,
                            placement_other: event.target.value,
                          }),
                        })
                      }
                    />
                    {otherPlacementInvalid ? (
                      <p className="text-destructive text-sm">
                        请说明其他放置方式。
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <div className="flex flex-col gap-2 sm:col-span-3">
                  <Label>衬底处理</Label>
                  <TreatmentStepsEditor
                    kind="substrate"
                    value={treatmentSteps ?? []}
                    disabled={disabled}
                    showErrors={showErrors}
                    labels={buildTreatmentStepsEditorLabels(t)}
                    onChange={(steps) =>
                      update(index, {
                        pretreatment_steps: JSON.stringify(steps),
                      })
                    }
                  />
                  {showErrors && treatmentSteps === null ? (
                    <p className="text-destructive text-sm">
                      预处理步骤数据无法读取，请重新填写。
                    </p>
                  ) : null}
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
        {substrates.length ? (
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
        ) : null}
        {substrates.length >= 2 ? (
          <div className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="font-medium">生长面相对放置</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || !availableRelationPair}
                onClick={() => {
                  if (!availableRelationPair) return
                  onPlacementRelationsChange([
                    ...placementRelations,
                    {
                      piece_a_label: availableRelationPair[0],
                      piece_b_label: availableRelationPair[1],
                    },
                  ])
                }}
              >
                <Plus data-icon="inline-start" />
                添加一组
              </Button>
            </div>
            {placementRelations.map((relation, relationIndex) => (
              <div
                key={`${relation.piece_a_label}-${relation.piece_b_label}-${relationIndex}`}
                className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <div className="flex flex-col gap-2">
                  <Label>衬底片 A</Label>
                  <Select
                    value={relation.piece_a_label}
                    disabled={disabled}
                    onValueChange={(value) =>
                      onPlacementRelationsChange(
                        placementRelations.map((item, current) =>
                          current === relationIndex
                            ? { ...item, piece_a_label: value }
                            : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {pieceLabels.map((label) => (
                          <SelectItem key={label} value={label}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>衬底片 B</Label>
                  <Select
                    value={relation.piece_b_label}
                    disabled={disabled}
                    onValueChange={(value) =>
                      onPlacementRelationsChange(
                        placementRelations.map((item, current) =>
                          current === relationIndex
                            ? { ...item, piece_b_label: value }
                            : item,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {pieceLabels.map((label) => (
                          <SelectItem key={label} value={label}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>间距（mm）</Label>
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0 表示接触"
                    value={relation.gap_mm ?? ''}
                    disabled={disabled}
                    onChange={(event) =>
                      onPlacementRelationsChange(
                        placementRelations.map((item, current) =>
                          current === relationIndex
                            ? {
                                ...item,
                                gap_mm: number(event.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="删除这组生长面相对关系"
                  disabled={disabled}
                  onClick={() =>
                    onPlacementRelationsChange(
                      placementRelations.filter(
                        (_, current) => current !== relationIndex,
                      ),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
            {showErrors &&
            !simpleSubstrateRelationsAreValid(
              substrates,
              placementRelations,
            ) ? (
              <p className="text-sm text-destructive">
                每组必须选择两片不同的衬底，且不能重复；间距如填写须大于等于 0。
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </ModuleCard>
  )
}

function minuteValue(seconds: number | undefined) {
  return seconds === undefined || !Number.isFinite(seconds)
    ? ''
    : String(seconds / 60)
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
    series: [{ start_s: 0, value: '' }],
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
  processEventsConfirmed,
  runId,
  token,
  setupId,
  setupSnapshot,
  zoneCount,
  disabled,
  showErrors,
  validationIssue,
  onTimelineChange,
  onSettingsChange,
  onEventsChange,
  onProcessEventsConfirmedChange,
}: {
  segments: SimpleSegment[]
  channels: SimpleChannel[]
  settings: SimpleProcessSettings
  events: SimpleProcessEvent[]
  processEventsConfirmed?: boolean | null
  runId: string
  token: string
  setupId: string
  setupSnapshot: Record<string, unknown> | null
  zoneCount: number | null
  disabled: boolean
  showErrors?: boolean
  validationIssue?: string | null
  onTimelineChange: (
    segments: SimpleSegment[],
    channels: SimpleChannel[],
  ) => void
  onSettingsChange: (settings: SimpleProcessSettings) => void
  onEventsChange: (events: SimpleProcessEvent[]) => void
  onProcessEventsConfirmedChange?: (confirmed: boolean) => void
}) {
  const { t } = useTranslation()
  const preparationOperations = settings.preparation_operations ?? []

  const syncPresetIntervals = (
    _nextSegments: SimpleSegment[],
    nextChannels: SimpleChannel[],
    nextSettings: SimpleProcessSettings,
  ) => {
    const processEnd = (nextSettings.process_duration_min ?? 0) * 60
    const wholeProcess = wholeProcessInterval(processEnd)
    return nextChannels.map((channel) =>
      channel.channel_type !== 'flow'
        ? channel
        : {
            ...channel,
            series: (channel.series ?? []).map((point) => {
              return point.timing_preset === 'whole_process' && wholeProcess
                ? { ...point, ...wholeProcess }
                : point
            }),
          },
    )
  }

  const setProcessSettings = (nextSettings: SimpleProcessSettings) => {
    onSettingsChange(nextSettings)
    onTimelineChange(
      segments,
      syncPresetIntervals(segments, channels, nextSettings),
    )
  }
  const updateChannel = (channelKey: string, next: SimpleChannel) => {
    const exists = channels.some((item) => item.channel_key === channelKey)
    const nextChannels = exists
      ? channels.map((item) => (item.channel_key === channelKey ? next : item))
      : [...channels, next]
    onTimelineChange(
      segments,
      syncPresetIntervals(segments, nextChannels, settings),
    )
  }
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
  const pressure = channels.find(
    (item) =>
      item.channel_type === 'pressure' && item.source_type === 'setpoint',
  )
  const pressureInvalid = Boolean(
    showErrors &&
    settings.pressure_regime &&
    settings.pressure_regime !== 'atmospheric' &&
    (!Number.isFinite(pressure?.scalar_value) ||
      (pressure?.scalar_value ?? 0) <= 0),
  )
  const capabilities = Array.isArray(setupSnapshot?.field_devices)
    ? (setupSnapshot.field_devices as string[]).filter(
        (item) => item !== 'none',
      )
    : []
  const allowedFieldTypes = capabilities.filter((item) =>
    actualFieldTypes.includes(item as (typeof actualFieldTypes)[number]),
  ) as (typeof actualFieldTypes)[number][]
  const processEnd = (settings.process_duration_min ?? 0) * 60
  const addGasChannel = () => {
    const wholeProcess = wholeProcessInterval(processEnd)
    onTimelineChange(segments, [
      ...channels,
      {
        ...newGasChannel('', setupId),
        series: [
          {
            start_s: wholeProcess?.start_s ?? 0,
            end_s: wholeProcess?.end_s ?? Number.NaN,
            value: '',
            timing_preset: 'whole_process',
          },
        ],
      },
    ])
  }
  const uploadMeasuredTemperature = async (zone: number, file: File) => {
    if (!file.name.toLocaleLowerCase().endsWith('.csv')) {
      toast.error('实测温度曲线必须使用 CSV 文件。')
      return
    }
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
        {showErrors && validationIssue ? (
          <p className="text-destructive text-sm">{validationIssue}</p>
        ) : null}
        <div
          className="flex flex-col gap-2 sm:max-w-sm"
          data-invalid={(showErrors && !(processEnd > 0)) || undefined}
        >
          <Label htmlFor="process-duration">
            过程总时长（min） <RequiredMark />
          </Label>
          <Input
            id="process-duration"
            type="number"
            min="0"
            step="any"
            value={settings.process_duration_min ?? ''}
            disabled={disabled}
            aria-invalid={(showErrors && !(processEnd > 0)) || undefined}
            onChange={(event) =>
              setProcessSettings({
                ...settings,
                process_duration_min:
                  event.target.value === ''
                    ? undefined
                    : Number(event.target.value),
              })
            }
          />
          <p className="text-sm text-muted-foreground">
            含降温与供气；以实验开始为 0 min。
          </p>
        </div>
        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>实验前准备</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {preparationOperations.map((operation, operationIndex) => {
              const preparationIssue = simplePreparationIssue(operation)
              const preparationInvalid = Boolean(showErrors && preparationIssue)
              const cyclic =
                operation.operation_type === 'gas_exchange' &&
                operation.exchange_mode === 'evacuation_backfill'
              const durationValid =
                Number.isFinite(operation.duration_min) &&
                Number(operation.duration_min) > 0
              const targetPressureValid =
                Number.isFinite(operation.target_absolute_pressure_Pa) &&
                Number(operation.target_absolute_pressure_Pa) > 0
              const patchOperation = (
                patch: Partial<(typeof preparationOperations)[number]>,
              ) =>
                setProcessSettings({
                  ...settings,
                  preparation_operations: preparationOperations.map(
                    (item, current) =>
                      current === operationIndex ? { ...item, ...patch } : item,
                  ),
                })
              return (
                <div
                  key={operationIndex}
                  className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
                  data-invalid={preparationInvalid || undefined}
                >
                  <div className="flex items-center justify-between gap-3 sm:col-span-2">
                    <p className="font-medium">准备操作 {operationIndex + 1}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() =>
                        setProcessSettings({
                          ...settings,
                          preparation_operations: preparationOperations.filter(
                            (_, current) => current !== operationIndex,
                          ),
                        })
                      }
                    >
                      <Trash2 data-icon="inline-start" />
                      删除
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>操作类型</Label>
                    <Select
                      value={operation.operation_type}
                      disabled={disabled}
                      onValueChange={(value) =>
                        patchOperation({
                          operation_type: value,
                          exchange_mode: undefined,
                          duration_min: undefined,
                          cycle_count: undefined,
                          backfill_absolute_pressure_Pa: undefined,
                          target_absolute_pressure_Pa:
                            value === 'pump_down'
                              ? operation.target_absolute_pressure_Pa
                              : undefined,
                          gas_sources:
                            value === 'gas_exchange'
                              ? [{ material_lot_id: '' }]
                              : undefined,
                          gases: undefined,
                          other_name: undefined,
                        })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`准备操作 ${operationIndex + 1} 类型`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="pump_down">抽真空</SelectItem>
                          <SelectItem value="gas_exchange">气氛置换</SelectItem>
                          <SelectItem value="other">其他操作</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  {operation.operation_type === 'gas_exchange' ? (
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor={`preparation-${operationIndex}-exchange-mode`}
                      >
                        置换方式 <RequiredMark />
                      </Label>
                      <Select
                        value={operation.exchange_mode ?? ''}
                        disabled={disabled}
                        onValueChange={(value) =>
                          patchOperation({
                            exchange_mode:
                              value as SimplePreparationOperation['exchange_mode'],
                            duration_min: undefined,
                            cycle_count: undefined,
                            target_absolute_pressure_Pa: undefined,
                            backfill_absolute_pressure_Pa: undefined,
                            gas_sources: operation.gas_sources?.map(
                              ({ flow_sccm: _flow, ...source }) => source,
                            ),
                          })
                        }
                      >
                        <SelectTrigger
                          id={`preparation-${operationIndex}-exchange-mode`}
                          className="w-full"
                          aria-invalid={
                            (showErrors && !operation.exchange_mode) ||
                            undefined
                          }
                        >
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="continuous_flow">
                              连续通气
                            </SelectItem>
                            <SelectItem value="evacuation_backfill">
                              抽空—回填
                            </SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {operation.operation_type === 'pump_down' || cyclic ? (
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor={`preparation-${operationIndex}-target-pressure`}
                      >
                        {cyclic
                          ? '抽空终点绝对压力（Pa）'
                          : '终点绝对压力（Pa）'}
                      </Label>
                      <Input
                        id={`preparation-${operationIndex}-target-pressure`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        value={
                          Number.isFinite(operation.target_absolute_pressure_Pa)
                            ? operation.target_absolute_pressure_Pa
                            : ''
                        }
                        disabled={disabled}
                        aria-invalid={
                          (showErrors &&
                            ((operation.target_absolute_pressure_Pa !==
                              undefined &&
                              !targetPressureValid) ||
                              (!cyclic &&
                                !targetPressureValid &&
                                !durationValid))) ||
                          undefined
                        }
                        onChange={(event) =>
                          patchOperation({
                            target_absolute_pressure_Pa:
                              event.target.value === ''
                                ? undefined
                                : Number(event.target.value),
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {cyclic ? (
                    <div className="flex flex-col gap-2">
                      <Label
                        htmlFor={`preparation-${operationIndex}-backfill-pressure`}
                      >
                        回填终点绝对压力（Pa）
                      </Label>
                      <Input
                        id={`preparation-${operationIndex}-backfill-pressure`}
                        type="number"
                        min="0"
                        step="any"
                        disabled={disabled}
                        value={operation.backfill_absolute_pressure_Pa ?? ''}
                        aria-invalid={
                          (showErrors &&
                            operation.backfill_absolute_pressure_Pa !==
                              undefined &&
                            (!Number.isFinite(
                              operation.backfill_absolute_pressure_Pa,
                            ) ||
                              operation.backfill_absolute_pressure_Pa <= 0 ||
                              (operation.target_absolute_pressure_Pa !==
                                undefined &&
                                operation.backfill_absolute_pressure_Pa <=
                                  operation.target_absolute_pressure_Pa))) ||
                          undefined
                        }
                        onChange={(event) =>
                          patchOperation({
                            backfill_absolute_pressure_Pa:
                              event.target.value === ''
                                ? undefined
                                : Number(event.target.value),
                          })
                        }
                      />
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    <Label>
                      {operation.operation_type === 'gas_exchange'
                        ? '总时长（min）'
                        : '持续时间（min）'}{' '}
                      {!cyclic &&
                        (operation.operation_type !== 'pump_down' ||
                        !targetPressureValid ? (
                          <RequiredMark />
                        ) : null)}
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`准备操作 ${operationIndex + 1} 持续时间（min）`}
                      value={
                        Number.isFinite(operation.duration_min)
                          ? operation.duration_min
                          : ''
                      }
                      disabled={disabled}
                      aria-invalid={
                        (showErrors &&
                          ((operation.duration_min !== undefined &&
                            !durationValid) ||
                            (!cyclic &&
                              !durationValid &&
                              (operation.operation_type !== 'pump_down' ||
                                !targetPressureValid)))) ||
                        undefined
                      }
                      onChange={(event) =>
                        patchOperation({
                          duration_min:
                            event.target.value === ''
                              ? undefined
                              : Number(event.target.value),
                        })
                      }
                    />
                  </div>
                  {operation.operation_type === 'pump_down' ? (
                    <p className="text-sm text-muted-foreground sm:col-span-2">
                      无压力读数时，填写持续时间。
                    </p>
                  ) : null}
                  {operation.operation_type === 'gas_exchange' ? (
                    <>
                      <fieldset
                        className="flex flex-col gap-3 rounded-md border p-3 sm:col-span-2"
                        data-invalid={
                          (showErrors && !operation.gas_sources?.length) ||
                          undefined
                        }
                      >
                        <legend className="px-1 text-sm font-medium">
                          置换气源（气瓶批次） <RequiredMark />
                        </legend>
                        {(operation.gas_sources ?? []).map(
                          (source, sourceIndex) => (
                            <div
                              key={sourceIndex}
                              className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_auto]"
                            >
                              <div className="min-w-0 flex-1">
                                <EntityReferenceSelect
                                  kind="material_lot"
                                  productLabel
                                  value={source.material_lot_id}
                                  selectedVersion={source.material_lot_version}
                                  selectedSnapshot={source.snapshot}
                                  disabled={disabled}
                                  allowedLotCategories={['gas_cylinder']}
                                  onChange={(id, entity) =>
                                    patchOperation({
                                      gases: undefined,
                                      gas_sources: (
                                        operation.gas_sources ?? []
                                      ).map((item, current) =>
                                        current === sourceIndex
                                          ? {
                                              ...item,
                                              material_lot_id: id,
                                              material_lot_version:
                                                entity?.latest_version?.version,
                                              snapshot:
                                                entity?.latest_version?.data,
                                            }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                              </div>
                              {operation.exchange_mode === 'continuous_flow' ? (
                                <div className="col-start-1 row-start-2 flex min-w-0 flex-col gap-2 sm:col-start-2 sm:row-start-1">
                                  <Label
                                    htmlFor={`preparation-${operationIndex}-flow-${sourceIndex}`}
                                  >
                                    流量（sccm）
                                  </Label>
                                  <Input
                                    id={`preparation-${operationIndex}-flow-${sourceIndex}`}
                                    type="number"
                                    min="0"
                                    step="any"
                                    disabled={disabled}
                                    value={source.flow_sccm ?? ''}
                                    aria-invalid={
                                      (showErrors &&
                                        source.flow_sccm !== undefined &&
                                        (!Number.isFinite(source.flow_sccm) ||
                                          source.flow_sccm <= 0)) ||
                                      undefined
                                    }
                                    onChange={(event) =>
                                      patchOperation({
                                        gas_sources: operation.gas_sources?.map(
                                          (item, current) =>
                                            current === sourceIndex
                                              ? {
                                                  ...item,
                                                  flow_sccm:
                                                    event.target.value === ''
                                                      ? undefined
                                                      : Number(
                                                          event.target.value,
                                                        ),
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                  />
                                </div>
                              ) : null}
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={`删除置换气源 ${sourceIndex + 1}`}
                                className="col-start-2 row-start-1 sm:col-start-3"
                                disabled={disabled}
                                onClick={() =>
                                  patchOperation({
                                    gas_sources: (
                                      operation.gas_sources ?? []
                                    ).filter(
                                      (_, current) => current !== sourceIndex,
                                    ),
                                  })
                                }
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          ),
                        )}
                        {operation.gases?.length &&
                        !operation.gas_sources?.length ? (
                          <p className="text-sm text-muted-foreground">
                            旧记录：{operation.gases.join(' + ')}
                            ；请补选气瓶批次。
                          </p>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="self-start"
                          disabled={disabled}
                          onClick={() =>
                            patchOperation({
                              gases: undefined,
                              gas_sources: [
                                ...(operation.gas_sources ?? []),
                                { material_lot_id: '' },
                              ],
                            })
                          }
                        >
                          <Plus data-icon="inline-start" />
                          添加气瓶批次
                        </Button>
                      </fieldset>
                      {cyclic ||
                      (!operation.exchange_mode &&
                        operation.cycle_count !== undefined) ? (
                        <div className="flex flex-col gap-2">
                          <Label>
                            {cyclic ? '循环次数' : '旧记录置换次数'}{' '}
                            <RequiredMark />
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            aria-label={`准备操作 ${operationIndex + 1} 循环次数`}
                            value={operation.cycle_count ?? ''}
                            disabled={disabled}
                            aria-invalid={
                              (showErrors &&
                                (!operation.cycle_count ||
                                  operation.cycle_count < 1 ||
                                  !Number.isInteger(operation.cycle_count))) ||
                              undefined
                            }
                            onChange={(event) =>
                              patchOperation({
                                cycle_count:
                                  event.target.value === ''
                                    ? undefined
                                    : Number(event.target.value),
                              })
                            }
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  {operation.operation_type === 'other' ? (
                    <div className="flex flex-col gap-2 sm:col-span-2">
                      <Label>
                        具体操作 <RequiredMark />
                      </Label>
                      <Input
                        value={operation.other_name ?? ''}
                        disabled={disabled}
                        onChange={(event) =>
                          patchOperation({ other_name: event.target.value })
                        }
                      />
                    </div>
                  ) : null}
                  {preparationInvalid ? (
                    <p className="text-sm text-destructive sm:col-span-2">
                      {preparationIssue}
                    </p>
                  ) : null}
                </div>
              )
            })}
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() =>
                setProcessSettings({
                  ...settings,
                  preparation_operations: [
                    ...preparationOperations,
                    {
                      operation_type: 'pump_down',
                    },
                  ],
                })
              }
            >
              <Plus data-icon="inline-start" />
              添加实验前准备
            </Button>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>温度程序</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {temperatureChannels.map((channel, zoneIndex) => {
              const series = channel.series?.length
                ? channel.series
                : [{ start_s: 0, value: '' }]
              return (
                <fieldset
                  key={zoneIndex}
                  className="flex flex-col gap-4 rounded-lg border p-4"
                >
                  <legend className="px-1 font-medium">
                    温区 {zoneIndex + 1}
                  </legend>
                  <div className="flex flex-col gap-2 sm:max-w-md">
                    <Label
                      htmlFor={`zone-${zoneIndex + 1}-initial-temperature`}
                    >
                      初始设定温度（℃） <RequiredMark />
                    </Label>
                    <Input
                      id={`zone-${zoneIndex + 1}-initial-temperature`}
                      type="number"
                      step="any"
                      placeholder="例如 25"
                      value={String(series[0].value)}
                      disabled={disabled}
                      aria-invalid={
                        (showErrors &&
                          (series[0].value === '' ||
                            !Number.isFinite(Number(series[0].value)))) ||
                        undefined
                      }
                      onChange={(event) =>
                        updateChannel(channel.channel_key, {
                          ...channel,
                          series: series.map((item, current) =>
                            current === 0
                              ? {
                                  ...item,
                                  value:
                                    event.target.value === ''
                                      ? ''
                                      : Number(event.target.value),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                  {series.slice(1).map((point, stepOffset) => {
                    const pointIndex = stepOffset + 1
                    const operation = temperatureStepOperation(
                      series[pointIndex - 1]?.value ?? '',
                      point.value,
                    )
                    return (
                      <div
                        key={`${channel.channel_key}-${pointIndex}`}
                        className="flex flex-col gap-3 rounded-md bg-muted/35 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              步骤 {pointIndex}
                            </span>
                            {operation ? (
                              <Badge variant="secondary">{operation}</Badge>
                            ) : null}
                            {operation === '降温' &&
                            point.start_s > series[pointIndex - 1].start_s ? (
                              <span className="text-sm text-muted-foreground">
                                设定{' '}
                                {Number(
                                  (
                                    (Number(series[pointIndex - 1].value) -
                                      Number(point.value)) /
                                    ((point.start_s -
                                      series[pointIndex - 1].start_s) /
                                      60)
                                  ).toPrecision(4),
                                )}{' '}
                                ℃/min
                              </span>
                            ) : null}
                          </div>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`删除温区 ${zoneIndex + 1} 第 ${pointIndex} 步`}
                            disabled={disabled}
                            onClick={() =>
                              updateChannel(channel.channel_key, {
                                ...channel,
                                series: series.filter(
                                  (_, current) => current !== pointIndex,
                                ),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <Label>
                              持续时间（min） <RequiredMark />
                            </Label>
                            <Input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="例如 30"
                              aria-label={`温区 ${zoneIndex + 1} 第 ${pointIndex} 步持续时间（min）`}
                              value={minuteValue(
                                point.start_s -
                                  (series[pointIndex - 1]?.start_s ?? 0),
                              )}
                              disabled={disabled}
                              aria-invalid={
                                (showErrors &&
                                  (!Number.isFinite(point.start_s) ||
                                    point.start_s <=
                                      (series[pointIndex - 1]?.start_s ??
                                        -1))) ||
                                undefined
                              }
                              onChange={(event) =>
                                updateChannel(channel.channel_key, {
                                  ...channel,
                                  series: updateTemperatureStepDuration(
                                    series,
                                    pointIndex,
                                    event.target.value === ''
                                      ? Number.NaN
                                      : Number(event.target.value),
                                  ),
                                })
                              }
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label>
                              终点设定温度（℃） <RequiredMark />
                            </Label>
                            <Input
                              type="number"
                              step="any"
                              placeholder="例如 750"
                              aria-label={`温区 ${zoneIndex + 1} 第 ${pointIndex} 步终点设定温度（℃）`}
                              value={String(point.value)}
                              disabled={disabled}
                              aria-invalid={
                                (showErrors &&
                                  (point.value === '' ||
                                    !Number.isFinite(Number(point.value)))) ||
                                undefined
                              }
                              onChange={(event) =>
                                updateChannel(channel.channel_key, {
                                  ...channel,
                                  series: series.map((item, current) =>
                                    current === pointIndex
                                      ? {
                                          ...item,
                                          value:
                                            event.target.value === ''
                                              ? ''
                                              : Number(event.target.value),
                                        }
                                      : item,
                                  ),
                                })
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
                    onClick={() => {
                      const exists = channels.some(
                        (item) => item.channel_key === channel.channel_key,
                      )
                      const next = {
                        ...channel,
                        series: [...series, { start_s: Number.NaN, value: '' }],
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
                    添加温度步骤
                  </Button>
                  <details className="text-sm text-muted-foreground">
                    <summary className="cursor-pointer">
                      上传实测温度曲线
                    </summary>
                    <Input
                      className="mt-3"
                      type="file"
                      accept=".csv"
                      disabled={disabled}
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        if (file) {
                          void uploadMeasuredTemperature(zoneIndex + 1, file)
                        }
                        event.target.value = ''
                      }}
                    />
                    <p className="mt-2 text-sm">
                      每个温区上传一个 CSV：time_s 为距实验开始的秒数，value
                      为温度（℃）。
                    </p>
                    {channels.some(
                      (item) =>
                        item.channel_type === 'temperature' &&
                        item.source_type === 'measured' &&
                        item.zone_index === zoneIndex + 1,
                    ) ? (
                      <div className="mt-2 flex items-center gap-2">
                        <span>已关联实测温度曲线</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() =>
                            onTimelineChange(
                              segments,
                              channels.filter(
                                (item) =>
                                  !(
                                    item.channel_type === 'temperature' &&
                                    item.source_type === 'measured' &&
                                    item.zone_index === zoneIndex + 1
                                  ),
                              ),
                            )
                          }
                        >
                          取消关联
                        </Button>
                      </div>
                    ) : null}
                  </details>
                </fieldset>
              )
            })}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>
              气体程序 <RequiredMark />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {gasChannels.length === 0 ? (
              <EmptyState
                description="尚未添加气体"
                action={
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={addGasChannel}
                  >
                    <Plus data-icon="inline-start" />
                    添加气体
                  </Button>
                }
              />
            ) : (
              <>
                {gasChannels.map((channel) => (
                  <div
                    key={channel.channel_key}
                    className="flex flex-col gap-4 rounded-lg border p-4"
                  >
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div
                        className="flex flex-col gap-2"
                        data-invalid={
                          (showErrors && !channel.gas_species_code?.trim()) ||
                          undefined
                        }
                      >
                        <Label>
                          气体种类 <RequiredMark />
                        </Label>
                        <Select
                          value={channel.gas_species_code ?? ''}
                          disabled={disabled}
                          onValueChange={(value) =>
                            updateChannel(channel.channel_key, {
                              ...channel,
                              subject_ref: value,
                              gas_species_code: value,
                              subject_instance_ref: `setup:${setupId}:gas:${value}:1`,
                              gas_lot_id: undefined,
                              gas_lot_version: undefined,
                              subject_snapshot: undefined,
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-full"
                            aria-label="气体种类"
                            aria-invalid={
                              (showErrors &&
                                !channel.gas_species_code?.trim()) ||
                              undefined
                            }
                          >
                            <SelectValue placeholder="请选择" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {Object.keys(gasSpecies).map((species) => (
                                <SelectItem key={species} value={species}>
                                  {species}
                                </SelectItem>
                              ))}
                              <SelectItem value="premixed">预混气</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div
                        className="flex flex-col gap-2"
                        data-invalid={
                          (showErrors &&
                            (!channel.gas_lot_id ||
                              !channel.gas_lot_version)) ||
                          undefined
                        }
                      >
                        <Label>
                          气瓶批次 <RequiredMark />
                        </Label>
                        <EntityReferenceSelect
                          kind="material_lot"
                          productLabel
                          value={channel.gas_lot_id ?? ''}
                          selectedVersion={channel.gas_lot_version}
                          selectedSnapshot={channel.subject_snapshot}
                          disabled={disabled}
                          allowedLotCategories={['gas_cylinder']}
                          filter={(entity) =>
                            gasCylinderMatchesSpecies(
                              entity.latest_version?.data,
                              channel.gas_species_code ?? '',
                            )
                          }
                          onChange={(id, entity) =>
                            updateChannel(channel.channel_key, {
                              ...channel,
                              gas_lot_id: id || undefined,
                              subject_instance_ref: `setup:${setupId}:gas:${id || channel.channel_key}`,
                              gas_lot_version:
                                entity?.latest_version?.version ?? undefined,
                              subject_snapshot: entity?.latest_version?.data,
                            })
                          }
                        />
                      </div>
                      <div
                        className="flex flex-col gap-2"
                        data-invalid={
                          (showErrors && !channel.measurement_source) ||
                          undefined
                        }
                      >
                        <Label>
                          流量测量方式 <RequiredMark />
                        </Label>
                        <Select
                          value={channel.measurement_source ?? ''}
                          disabled={disabled}
                          onValueChange={(value) =>
                            updateChannel(channel.channel_key, {
                              ...channel,
                              measurement_source:
                                value as SimpleChannel['measurement_source'],
                              source_type:
                                value === 'mfc' ? 'setpoint' : 'measured',
                              measurement_source_other:
                                value === 'other'
                                  ? channel.measurement_source_other
                                  : undefined,
                            })
                          }
                        >
                          <SelectTrigger
                            className="w-full"
                            aria-label="流量测量方式"
                            aria-invalid={
                              (showErrors && !channel.measurement_source) ||
                              undefined
                            }
                          >
                            <SelectValue placeholder="请选择" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="mfc">
                                质量流量控制器（MFC）
                              </SelectItem>
                              <SelectItem value="rotameter">
                                {localizedOption('rotameter', 'zh')}
                              </SelectItem>
                              <SelectItem value="other">其他</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {channel.measurement_source === 'other' ? (
                      <div
                        className="flex flex-col gap-2"
                        data-invalid={
                          (showErrors &&
                            !channel.measurement_source_other?.trim()) ||
                          undefined
                        }
                      >
                        <Label>
                          其他流量测量方式 <RequiredMark />
                        </Label>
                        <Input
                          value={channel.measurement_source_other ?? ''}
                          disabled={disabled}
                          aria-invalid={
                            (showErrors &&
                              !channel.measurement_source_other?.trim()) ||
                            undefined
                          }
                          onChange={(event) =>
                            updateChannel(channel.channel_key, {
                              ...channel,
                              measurement_source_other: event.target.value,
                            })
                          }
                        />
                      </div>
                    ) : null}
                    <div className="flex flex-col gap-2 sm:max-w-xs">
                      <Label>
                        流量单位 <RequiredMark />
                      </Label>
                      <Select
                        value={channel.unit}
                        disabled={disabled}
                        onValueChange={(unit) =>
                          updateChannel(channel.channel_key, {
                            ...channel,
                            unit,
                          })
                        }
                      >
                        <SelectTrigger aria-label="流量单位" className="w-full">
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {['sccm', 'slm', 'mL/min', 'L/min'].map((unit) => (
                              <SelectItem key={unit} value={unit}>
                                {unit}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-3">
                      {(channel.series ?? []).map((interval, intervalIndex) => {
                        const flowLabel = `${channel.gas_species_code === 'premixed' ? '预混气总流量' : '流量'}${channel.source_type === 'setpoint' ? '设定值' : channel.source_type === 'inferred' ? '推导值' : '读数'}（${channel.unit}）`
                        const timingPreset =
                          interval.timing_preset === 'whole_process'
                            ? 'whole_process'
                            : 'custom'
                        const patchInterval = (
                          patch: Partial<typeof interval>,
                        ) =>
                          updateChannel(channel.channel_key, {
                            ...channel,
                            series: (channel.series ?? []).map(
                              (item, current) =>
                                current === intervalIndex
                                  ? { ...item, ...patch }
                                  : item,
                            ),
                          })
                        return (
                          <div
                            key={`${channel.channel_key}-${intervalIndex}`}
                            className="grid gap-4 rounded-md border p-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]"
                          >
                            <div className="flex flex-col gap-2">
                              <Label>
                                供气时段 <RequiredMark />
                              </Label>
                              <Select
                                value={timingPreset}
                                disabled={disabled}
                                onValueChange={(value) => {
                                  const preset = value as GasTimingPreset
                                  const nextInterval =
                                    preset === 'whole_process'
                                      ? wholeProcessInterval(processEnd)
                                      : null
                                  patchInterval({
                                    timing_preset: preset,
                                    ...(nextInterval ?? {}),
                                  })
                                }}
                              >
                                <SelectTrigger
                                  className="w-full"
                                  aria-label="供气使用时段"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {([['whole_process', '全程']] as const).map(
                                      ([value, label]) => (
                                        <SelectItem
                                          key={value}
                                          value={value}
                                          disabled={
                                            !wholeProcessInterval(processEnd)
                                          }
                                        >
                                          {processEnd > 0
                                            ? `${label}（0–${minuteValue(processEnd)} min）`
                                            : label}
                                        </SelectItem>
                                      ),
                                    )}
                                    <SelectItem value="custom">
                                      自定义时间
                                    </SelectItem>
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Label>
                                {flowLabel} <RequiredMark />
                              </Label>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                aria-label={flowLabel}
                                value={String(interval.value)}
                                disabled={disabled}
                                aria-invalid={
                                  (showErrors &&
                                    (interval.value === '' ||
                                      !Number.isFinite(
                                        Number(interval.value),
                                      ) ||
                                      Number(interval.value) <= 0)) ||
                                  undefined
                                }
                                onChange={(event) =>
                                  patchInterval({
                                    value:
                                      event.target.value === ''
                                        ? ''
                                        : Number(event.target.value),
                                  })
                                }
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label="删除供气时段"
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
                            </div>
                            {timingPreset === 'custom' ? (
                              <div className="grid gap-3 sm:col-span-3 sm:grid-cols-2">
                                {(
                                  [
                                    ['start_s', '起始时间（min）'],
                                    ['end_s', '结束时间（min）'],
                                  ] as const
                                ).map(([field, label]) => (
                                  <div
                                    key={field}
                                    className="flex flex-col gap-2"
                                  >
                                    <Label>{label}</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      step="any"
                                      aria-label={label}
                                      value={minuteValue(interval[field])}
                                      disabled={disabled}
                                      onChange={(event) =>
                                        patchInterval({
                                          [field]:
                                            event.target.value === ''
                                              ? Number.NaN
                                              : Number(event.target.value) * 60,
                                        })
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => {
                          const wholeProcess = wholeProcessInterval(processEnd)
                          updateChannel(channel.channel_key, {
                            ...channel,
                            series: [
                              ...(channel.series ?? []),
                              {
                                start_s: wholeProcess?.start_s ?? Number.NaN,
                                end_s: wholeProcess?.end_s,
                                value: '',
                                timing_preset: 'whole_process',
                              },
                            ],
                          })
                        }}
                      >
                        <Plus data-icon="inline-start" />
                        添加供气时段
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={disabled}
                        onClick={() =>
                          onTimelineChange(
                            segments,
                            channels.filter(
                              (item) =>
                                item.channel_key !== channel.channel_key,
                            ),
                          )
                        }
                      >
                        <Trash2 data-icon="inline-start" />
                        删除该气体
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={addGasChannel}
                >
                  <Plus data-icon="inline-start" />
                  添加气体
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-5 sm:grid-cols-2">
          <Card
            size="sm"
            data-invalid={
              (showErrors && !settings.pressure_regime) || undefined
            }
          >
            <CardHeader className="border-b">
              <CardTitle>反应压力</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Label>
                压力条件 <RequiredMark />
              </Label>
              <Select
                value={settings.pressure_regime ?? ''}
                disabled={disabled}
                onValueChange={(value) => {
                  const regime =
                    value as SimpleProcessSettings['pressure_regime']
                  onSettingsChange({ ...settings, pressure_regime: regime })
                  if (regime === 'atmospheric') {
                    onTimelineChange(
                      segments,
                      channels.filter(
                        (item) =>
                          item.channel_type !== 'pressure' ||
                          item.source_type !== 'setpoint',
                      ),
                    )
                  } else if (pressure) {
                    updateChannel(pressure.channel_key, {
                      ...pressure,
                      pressure_type: 'absolute',
                    })
                  }
                }}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label="反应压力条件"
                  aria-invalid={
                    (showErrors && !settings.pressure_regime) || undefined
                  }
                >
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="low_pressure">减压（含真空）</SelectItem>
                    <SelectItem value="atmospheric">常压</SelectItem>
                    <SelectItem value="high_pressure">加压</SelectItem>
                    {settings.pressure_regime === 'other' ? (
                      <SelectItem value="other">其他（历史记录）</SelectItem>
                    ) : null}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {settings.pressure_regime &&
              settings.pressure_regime !== 'atmospheric' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div
                    className="flex flex-col gap-2"
                    data-invalid={pressureInvalid || undefined}
                  >
                    <Label>
                      工作绝对压力 <RequiredMark />
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      aria-label="工作绝对压力"
                      value={pressure?.scalar_value ?? ''}
                      disabled={disabled}
                      aria-invalid={pressureInvalid || undefined}
                      onChange={(event) => {
                        if (event.target.value.trim() === '') {
                          onTimelineChange(
                            segments,
                            channels.filter(
                              (item) =>
                                item.channel_type !== 'pressure' ||
                                item.source_type !== 'setpoint',
                            ),
                          )
                          return
                        }
                        const next: SimpleChannel = {
                          channel_key: pressure?.channel_key ?? key('channel'),
                          channel_type: 'pressure',
                          source_type: 'setpoint',
                          subject_type: 'pressure_location',
                          subject_ref: 'reactor',
                          subject_instance_ref: `setup:${setupId}:pressure:1`,
                          pressure_location: 'reactor',
                          pressure_type: 'absolute',
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
                      <SelectTrigger className="w-full" aria-label="压力单位">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {['Pa', 'kPa', 'MPa', 'bar', 'mbar', 'Torr'].map(
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
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card
            size="sm"
            data-invalid={(showErrors && !settings.cooling_method) || undefined}
          >
            <CardHeader className="border-b">
              <CardTitle>
                降温方式 <RequiredMark />
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Label htmlFor="cooling-method" className="sr-only">
                降温方式
              </Label>
              <Select
                value={settings.cooling_method ?? ''}
                disabled={disabled}
                onValueChange={(value) =>
                  onSettingsChange({
                    ...settings,
                    cooling_method:
                      value as SimpleProcessSettings['cooling_method'],
                    cooling_sequence:
                      value === 'staged_cooling'
                        ? [{ method: '' }, { method: '' }]
                        : [],
                    cooling_other:
                      value === 'other' ? settings.cooling_other : undefined,
                    cooling_rate_C_per_min:
                      value === 'controlled_cooling'
                        ? settings.cooling_rate_C_per_min
                        : undefined,
                    lid_open_temperature_C:
                      value === 'open_lid_cooling'
                        ? settings.lid_open_temperature_C
                        : undefined,
                  })
                }
              >
                <SelectTrigger
                  id="cooling-method"
                  className="w-full"
                  aria-label="降温方式"
                  aria-invalid={
                    (showErrors && !settings.cooling_method) || undefined
                  }
                >
                  <SelectValue placeholder="请选择" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="furnace_cooling">随炉冷却</SelectItem>
                    <SelectItem value="open_lid_cooling">开盖冷却</SelectItem>
                    <SelectItem value="rapid_furnace_move_cooling">
                      移炉冷却
                    </SelectItem>
                    <SelectItem value="controlled_cooling">程序降温</SelectItem>
                    <SelectItem value="staged_cooling">分段降温</SelectItem>
                    <SelectItem value="other">其他</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {settings.cooling_method === 'staged_cooling' ? (
                <div className="flex flex-col gap-3">
                  {(settings.cooling_sequence ?? []).map((step, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-2 rounded-md border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label>
                          第 {index + 1} 段 <RequiredMark />
                        </Label>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={disabled}
                          aria-label={`删除第 ${index + 1} 段降温`}
                          onClick={() =>
                            onSettingsChange({
                              ...settings,
                              cooling_sequence:
                                settings.cooling_sequence?.filter(
                                  (_, current) => current !== index,
                                ),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                      <Select
                        value={step.method}
                        disabled={disabled}
                        onValueChange={(method) =>
                          onSettingsChange({
                            ...settings,
                            cooling_sequence: settings.cooling_sequence?.map(
                              (item, current) =>
                                current === index ? { method } : item,
                            ),
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label={`第 ${index + 1} 段降温方式`}
                          aria-invalid={
                            (showErrors && !step.method) || undefined
                          }
                          className="w-full"
                        >
                          <SelectValue placeholder="请选择" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="controlled_cooling">
                              程序降温
                            </SelectItem>
                            <SelectItem value="furnace_cooling">
                              随炉冷却
                            </SelectItem>
                            <SelectItem value="open_lid_cooling">
                              开盖冷却
                            </SelectItem>
                            <SelectItem value="rapid_furnace_move_cooling">
                              移炉冷却
                            </SelectItem>
                            <SelectItem value="other">其他</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {step.method === 'open_lid_cooling' ||
                      step.method === 'other' ? (
                        <>
                          <Label htmlFor={`cooling-detail-${index}`}>
                            {step.method === 'other'
                              ? '其他降温方式'
                              : '开盖温度（℃）'}{' '}
                            <RequiredMark />
                          </Label>
                          <Input
                            id={`cooling-detail-${index}`}
                            type={step.method === 'other' ? 'text' : 'number'}
                            step="any"
                            disabled={disabled}
                            value={
                              step.method === 'other'
                                ? (step.other_name ?? '')
                                : (step.lid_open_temperature_C ?? '')
                            }
                            aria-invalid={
                              (showErrors &&
                                (step.method === 'other'
                                  ? !step.other_name?.trim()
                                  : !Number.isFinite(
                                      step.lid_open_temperature_C,
                                    ))) ||
                              undefined
                            }
                            onChange={(event) =>
                              onSettingsChange({
                                ...settings,
                                cooling_sequence:
                                  settings.cooling_sequence?.map(
                                    (item, current) =>
                                      current !== index
                                        ? item
                                        : {
                                            ...item,
                                            ...(step.method === 'other'
                                              ? {
                                                  other_name:
                                                    event.target.value,
                                                }
                                              : {
                                                  lid_open_temperature_C:
                                                    event.target.value === ''
                                                      ? undefined
                                                      : Number(
                                                          event.target.value,
                                                        ),
                                                }),
                                          },
                                  ),
                              })
                            }
                          />
                        </>
                      ) : null}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    onClick={() =>
                      onSettingsChange({
                        ...settings,
                        cooling_sequence: [
                          ...(settings.cooling_sequence ?? []),
                          { method: '' },
                        ],
                      })
                    }
                  >
                    <Plus data-icon="inline-start" />
                    添加降温操作
                  </Button>
                </div>
              ) : null}
              {settings.cooling_method === 'controlled_cooling' ||
              settings.cooling_sequence?.some(
                (step) => step.method === 'controlled_cooling',
              ) ? (
                <p className="text-sm text-muted-foreground">
                  降温步骤填写在温度程序中。
                  {settings.cooling_rate_C_per_min !== undefined
                    ? `旧记录设定速率：${settings.cooling_rate_C_per_min} ℃/min。`
                    : ''}
                </p>
              ) : null}
              {settings.cooling_method === 'open_lid_cooling' ? (
                <div
                  className="flex flex-col gap-2"
                  data-invalid={
                    (showErrors &&
                      !Number.isFinite(settings.lid_open_temperature_C)) ||
                    undefined
                  }
                >
                  <Label>
                    开盖温度（℃） <RequiredMark />
                  </Label>
                  <Input
                    type="number"
                    step="any"
                    value={settings.lid_open_temperature_C ?? ''}
                    disabled={disabled}
                    aria-invalid={
                      (showErrors &&
                        !Number.isFinite(settings.lid_open_temperature_C)) ||
                      undefined
                    }
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        lid_open_temperature_C:
                          event.target.value === ''
                            ? undefined
                            : Number(event.target.value),
                      })
                    }
                  />
                </div>
              ) : null}
              {settings.cooling_method === 'other' ? (
                <div
                  className="flex flex-col gap-2"
                  data-invalid={
                    (showErrors && !settings.cooling_other?.trim()) || undefined
                  }
                >
                  <Label>
                    其他降温方式 <RequiredMark />
                  </Label>
                  <Input
                    value={settings.cooling_other ?? ''}
                    disabled={disabled}
                    aria-invalid={
                      (showErrors && !settings.cooling_other?.trim()) ||
                      undefined
                    }
                    onChange={(event) =>
                      onSettingsChange({
                        ...settings,
                        cooling_other: event.target.value,
                      })
                    }
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>

        {allowedFieldTypes.length > 0 ? (
          <Card size="sm">
            <CardHeader className="border-b">
              <CardTitle>实际外场或等离子体</CardTitle>
              <CardDescription>
                仅记录本炉实际启用的程序；未添加即表示本炉未使用。可选类型来自所选实验装置的能力。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldParamsEditor
                value={settings.field_params ?? []}
                allowedTypes={allowedFieldTypes}
                disabled={disabled}
                showErrors={showErrors}
                labels={buildFieldParamsEditorLabels(
                  t,
                  String(setupSnapshot?.field_device_other_name ?? ''),
                )}
                onChange={(field_params) =>
                  onSettingsChange({
                    ...settings,
                    field_params,
                    external_fields: undefined,
                  })
                }
              />
            </CardContent>
          </Card>
        ) : null}

        <Card size="sm">
          <CardHeader className="border-b">
            <CardTitle>异常记录</CardTitle>
            <CardDescription>未勾选表示本炉无异常。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                id="process-anomaly-occurred"
                checked={processEventsConfirmed === true}
                disabled={disabled}
                onCheckedChange={(checked) => {
                  const confirmed = checked === true
                  onProcessEventsConfirmedChange?.(confirmed)
                  onEventsChange(
                    confirmed
                      ? events.length > 0
                        ? events
                        : [newProcessEvent()]
                      : [],
                  )
                }}
              />
              <Label htmlFor="process-anomaly-occurred">本炉发生过异常</Label>
            </div>
            {events.map((processEvent, eventIndex) => {
              const eventText = splitEventDescription(processEvent.description)
              const eventTypeInvalid = Boolean(
                showErrors &&
                (processEvent.observed_deviations.length === 0 ||
                  processEvent.observed_deviations.some(
                    (code) =>
                      !PROCESS_DEVIATION_OPTIONS.some(
                        ([value]) => value === code,
                      ),
                  )),
              )
              const eventTimeInvalid = Boolean(
                showErrors &&
                (!Number.isFinite(processEvent.start_s) ||
                  processEvent.start_s < 0),
              )
              const otherDescriptionInvalid = Boolean(
                showErrors &&
                processEvent.observed_deviations.includes('other') &&
                !eventText.description.trim(),
              )
              const patchEvent = (patch: Partial<SimpleProcessEvent>) =>
                onEventsChange(
                  events.map((item, current) =>
                    current === eventIndex ? { ...item, ...patch } : item,
                  ),
                )
              return (
                <fieldset
                  key={processEvent.event_key}
                  className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
                >
                  <legend className="px-1 font-medium">
                    异常事件 {eventIndex + 1}
                  </legend>
                  <div className="flex justify-end sm:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() =>
                        onEventsChange(
                          events.filter((_, current) => current !== eventIndex),
                        )
                      }
                    >
                      <Trash2 data-icon="inline-start" />
                      删除异常事件
                    </Button>
                  </div>
                  <div
                    className="flex flex-col gap-2"
                    data-invalid={eventTypeInvalid || undefined}
                  >
                    <Label>
                      异常类型 <RequiredMark />
                    </Label>
                    <Select
                      value={processEvent.observed_deviations[0] ?? ''}
                      disabled={disabled}
                      onValueChange={(value) =>
                        patchEvent({ observed_deviations: [value] })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label="异常类型"
                        aria-invalid={eventTypeInvalid || undefined}
                      >
                        <SelectValue placeholder="请选择异常类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {PROCESS_DEVIATION_OPTIONS.map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div
                    className="flex flex-col gap-2"
                    data-invalid={eventTimeInvalid || undefined}
                  >
                    <Label>
                      发生时间（min） <RequiredMark />
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={minuteValue(processEvent.start_s)}
                      disabled={disabled}
                      aria-invalid={eventTimeInvalid || undefined}
                      onChange={(inputEvent) =>
                        patchEvent({
                          start_s:
                            inputEvent.target.value === ''
                              ? Number.NaN
                              : Number(inputEvent.target.value) * 60,
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>是否影响本炉数据</Label>
                    <Select
                      value={processEvent.data_validity_impact ?? 'unknown'}
                      disabled={disabled}
                      onValueChange={(value) =>
                        patchEvent({ data_validity_impact: value })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="none">不影响</SelectItem>
                          <SelectItem value="partial">部分影响</SelectItem>
                          <SelectItem value="invalid">
                            本炉数据不应使用
                          </SelectItem>
                          <SelectItem value="unknown">不确定</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>处理结果</Label>
                    <Select
                      value={processEvent.outcome ?? 'unknown'}
                      disabled={disabled}
                      onValueChange={(value) => patchEvent({ outcome: value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="recovered">已恢复</SelectItem>
                          <SelectItem value="partially_recovered">
                            部分恢复
                          </SelectItem>
                          <SelectItem value="terminated">实验终止</SelectItem>
                          <SelectItem value="unknown">不确定</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  <div
                    className="flex flex-col gap-2 sm:col-span-2"
                    data-invalid={otherDescriptionInvalid || undefined}
                  >
                    <Label>
                      异常情况
                      {processEvent.observed_deviations.includes('other') ? (
                        <RequiredMark />
                      ) : null}
                    </Label>
                    <Textarea
                      value={eventText.description}
                      disabled={disabled}
                      aria-invalid={otherDescriptionInvalid || undefined}
                      onChange={(inputEvent) =>
                        patchEvent({
                          description: buildEventDescription(
                            inputEvent.target.value,
                            eventText.action,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label>采取的处理</Label>
                    <Textarea
                      value={eventText.action}
                      disabled={disabled}
                      onChange={(inputEvent) =>
                        patchEvent({
                          intervention_actions: inputEvent.target.value.trim()
                            ? ['other']
                            : [],
                          description: buildEventDescription(
                            eventText.description,
                            inputEvent.target.value,
                          ),
                        })
                      }
                    />
                  </div>
                  {runId ? (
                    <div className="sm:col-span-2">
                      <ExperimentAttachments
                        runId={runId}
                        role="process_event_attachment"
                        bindingType="process_event"
                        bindingId={processEvent.event_key}
                        readOnly={disabled}
                        onFilesChange={(files) =>
                          patchEvent({
                            attachment_file_ids: files.map((file) => file.id),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </fieldset>
              )
            })}
            {events.length > 0 ? (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={disabled}
                  onClick={() => onEventsChange([...events, newProcessEvent()])}
                >
                  <Plus data-icon="inline-start" />
                  添加另一条异常事件
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ModuleCard>
  )
}
