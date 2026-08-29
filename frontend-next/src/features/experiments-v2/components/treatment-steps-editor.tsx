import { useId, useRef } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import { canonicalOption } from '@/shared/field-i18n'
import { gasSpecies } from '@/shared/generated/field-metadata'
import { RequiredMark } from '@/shared/ui/required-mark'

export const precursorTreatmentTypes = [
  'direct_load',
  'melt_solidify',
  'pelletize',
  'spin_coat',
  'anneal',
  'grind',
  'other',
] as const

export const substrateTreatmentTypes = [
  'acetone_clean',
  'isopropanol_clean',
  'nitrogen_dry',
  'anneal',
  'plasma_treatment',
  'hydrophilic_treatment',
  'other',
] as const

export const sourceLoadTreatmentTypes = [
  'direct_load',
  'grind',
  'mix',
  'pelletize',
  'spin_coat',
  'pre_anneal',
  'other',
] as const

export type PrecursorTreatmentType = (typeof precursorTreatmentTypes)[number]
export type SubstrateTreatmentType = (typeof substrateTreatmentTypes)[number]
export type SourceLoadTreatmentType = (typeof sourceLoadTreatmentTypes)[number]
export type TreatmentType =
  | PrecursorTreatmentType
  | SubstrateTreatmentType
  | SourceLoadTreatmentType
  | ''
export type TreatmentKind = 'precursor' | 'substrate' | 'source_load'

export interface NamedTreatmentParameter {
  name: string
  value: string | number
  unit: string
}

export interface SpinCoatStage {
  speed_rpm: number | null
  duration_s: number | null
}

export type TreatmentParameterValue =
  | string
  | number
  | null
  | undefined
  | Array<NamedTreatmentParameter | SpinCoatStage>

export type TreatmentParameters = Record<string, TreatmentParameterValue>

export interface TreatmentStep {
  type: TreatmentType
  other_name?: string | null
  parameters: TreatmentParameters
}

type TreatmentFieldKey =
  | 'temperature_C'
  | 'duration_min'
  | 'duration_s'
  | 'speed_rpm'
  | 'atmosphere'
  | 'power_W'
  | 'gas_species'
  | 'pressure_Pa'
  | 'pressure_MPa'
  | 'die_diameter_mm'
  | 'method'

export interface TreatmentStepsEditorLabels {
  addStep: string
  step: (position: number) => string
  type: string
  selectType: string
  moveUp: string
  moveDown: string
  removeStep: string
  otherName: string
  addParameter: string
  parameter: (position: number) => string
  parameterName: string
  parameterValue: string
  parameterUnit: string
  removeParameter: string
  addSpinStage: string
  spinStage: (position: number) => string
  removeSpinStage: string
  selectAtmosphere: string
  noAtmosphere: string
  otherAtmosphereName: string
  requiredMessage: string
  invalidMessage: string
  atmosphereOptions: Record<string, string>
  types: Record<Exclude<TreatmentType, ''>, string>
  fields: Record<TreatmentFieldKey, string>
}

export interface TreatmentStepsEditorProps {
  kind: TreatmentKind
  value: TreatmentStep[]
  onChange: (value: TreatmentStep[]) => void
  disabled?: boolean
  showErrors?: boolean
  labels: TreatmentStepsEditorLabels
}

type ParameterDefinition = {
  key: TreatmentFieldKey
  kind: 'number' | 'text' | 'atmosphere'
  required?: boolean
  positive?: boolean
  min?: number
  unit?: string
}

const precursorDefinitions: Partial<
  Record<PrecursorTreatmentType, ParameterDefinition[]>
> = {
  direct_load: [],
  melt_solidify: [
    {
      key: 'temperature_C',
      kind: 'number',
      required: true,
      min: -273.15,
      unit: '°C',
    },
    { key: 'duration_min', kind: 'number', positive: true, unit: 'min' },
  ],
  spin_coat: [],
  anneal: [
    {
      key: 'temperature_C',
      kind: 'number',
      required: true,
      min: -273.15,
      unit: '°C',
    },
    {
      key: 'duration_min',
      kind: 'number',
      required: true,
      positive: true,
      unit: 'min',
    },
    { key: 'atmosphere', kind: 'atmosphere' },
  ],
  grind: [{ key: 'duration_min', kind: 'number', positive: true, unit: 'min' }],
  pelletize: [
    {
      key: 'pressure_MPa',
      kind: 'number',
      required: true,
      positive: true,
      unit: 'MPa',
    },
    {
      key: 'duration_s',
      kind: 'number',
      positive: true,
      unit: 's',
    },
    {
      key: 'die_diameter_mm',
      kind: 'number',
      positive: true,
      unit: 'mm',
    },
  ],
}

const substrateDefinitions: Partial<
  Record<SubstrateTreatmentType, ParameterDefinition[]>
> = {
  acetone_clean: [
    { key: 'duration_min', kind: 'number', positive: true, unit: 'min' },
  ],
  isopropanol_clean: [
    { key: 'duration_min', kind: 'number', positive: true, unit: 'min' },
  ],
  nitrogen_dry: [
    { key: 'duration_min', kind: 'number', positive: true, unit: 'min' },
  ],
  anneal: precursorDefinitions.anneal,
  plasma_treatment: [
    {
      key: 'power_W',
      kind: 'number',
      required: true,
      positive: true,
      unit: 'W',
    },
    { key: 'gas_species', kind: 'text', required: true },
    {
      key: 'duration_min',
      kind: 'number',
      required: true,
      positive: true,
      unit: 'min',
    },
    {
      key: 'pressure_Pa',
      kind: 'number',
      positive: true,
      unit: 'Pa',
    },
  ],
  hydrophilic_treatment: [
    { key: 'method', kind: 'text' },
    { key: 'duration_min', kind: 'number', positive: true, unit: 'min' },
  ],
}

const sourceLoadDefinitions: Partial<
  Record<SourceLoadTreatmentType, ParameterDefinition[]>
> = {
  direct_load: [],
  grind: precursorDefinitions.grind,
  mix: [],
  pelletize: precursorDefinitions.pelletize,
  spin_coat: precursorDefinitions.spin_coat,
  pre_anneal: precursorDefinitions.anneal,
  other: [],
}

function definitionsFor(
  kind: TreatmentKind,
  type: TreatmentType,
): ParameterDefinition[] {
  if (!type) return []
  const definitions =
    kind === 'precursor'
      ? precursorDefinitions[type as PrecursorTreatmentType]
      : kind === 'substrate'
        ? substrateDefinitions[type as SubstrateTreatmentType]
        : sourceLoadDefinitions[type as SourceLoadTreatmentType]
  return definitions ?? []
}

function typesFor(kind: TreatmentKind): readonly Exclude<TreatmentType, ''>[] {
  return kind === 'precursor'
    ? precursorTreatmentTypes
    : kind === 'substrate'
      ? substrateTreatmentTypes
      : sourceLoadTreatmentTypes
}

function namedParametersMode(
  kind: TreatmentKind,
  type: TreatmentType,
): 'optional' | 'required' | null {
  if (type === 'other' && kind !== 'precursor') return 'required'
  return kind === 'source_load' && type === 'mix' ? 'optional' : null
}

function emptyParameters(
  kind: TreatmentKind,
  type: TreatmentType,
): TreatmentParameters {
  if (type === 'spin_coat') {
    return { stages: [{ speed_rpm: null, duration_s: null }] }
  }
  return namedParametersMode(kind, type) ? { items: [] } : {}
}

function numberFromInput(value: string): number | null {
  return value === '' ? null : Number(value)
}

const noAtmosphereValue = '__none__'
const atmosphereCodes = ['air', 'vacuum', ...Object.keys(gasSpecies), 'other']
const atmosphereCodeSet = new Set(atmosphereCodes)

function canonicalAtmosphere(value: TreatmentParameterValue): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  const canonical = canonicalOption(value.trim())
  if (atmosphereCodeSet.has(canonical)) return canonical
  const normalized = canonical.toLowerCase()
  for (const [code, definition] of Object.entries(gasSpecies)) {
    if (
      code.toLowerCase() === normalized ||
      definition.aliases.some(
        (alias) => alias.trim().toLowerCase() === normalized,
      )
    ) {
      return code
    }
  }
  return 'other'
}

function atmosphereOtherName(parameters: TreatmentParameters): string {
  const explicit = parameters.atmosphere_other
  if (typeof explicit === 'string' && explicit.trim()) return explicit
  const raw = parameters.atmosphere
  return typeof raw === 'string' && canonicalAtmosphere(raw) === 'other'
    ? raw === 'other'
      ? ''
      : raw
    : ''
}

function parameterInvalid(
  definition: ParameterDefinition,
  value: TreatmentParameterValue,
  showErrors: boolean,
): boolean {
  if (definition.kind === 'atmosphere') {
    return (
      Boolean(definition.required && showErrors) &&
      canonicalAtmosphere(value) === ''
    )
  }
  if (definition.kind === 'text') {
    return (
      Boolean(definition.required && showErrors) &&
      (typeof value !== 'string' || value.trim() === '')
    )
  }
  if (value == null || value === '') {
    return Boolean(definition.required && showErrors)
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return true
  if (definition.positive && numeric <= 0) return true
  return definition.min != null && numeric <= definition.min
}

function parameterMissing(value: TreatmentParameterValue): boolean {
  return value == null || (typeof value === 'string' && value.trim() === '')
}

function spinCoatStages(parameters: TreatmentParameters): SpinCoatStage[] {
  if (Array.isArray(parameters.stages)) {
    return (parameters.stages as SpinCoatStage[]).map((stage) => ({
      speed_rpm:
        stage.speed_rpm != null && Number.isFinite(Number(stage.speed_rpm))
          ? Number(stage.speed_rpm)
          : null,
      duration_s:
        stage.duration_s != null && Number.isFinite(Number(stage.duration_s))
          ? Number(stage.duration_s)
          : null,
    }))
  }
  if ('speed_rpm' in parameters || 'duration_s' in parameters) {
    return [
      {
        speed_rpm: Number.isFinite(Number(parameters.speed_rpm))
          ? Number(parameters.speed_rpm)
          : null,
        duration_s: Number.isFinite(Number(parameters.duration_s))
          ? Number(parameters.duration_s)
          : null,
      },
    ]
  }
  return []
}

export function normalizeTreatmentSteps(
  steps: TreatmentStep[],
): TreatmentStep[] {
  return steps.map((step) =>
    step.type === 'spin_coat'
      ? {
          ...step,
          parameters: { stages: spinCoatStages(step.parameters) },
        }
      : step,
  )
}

export function treatmentStepsAreValid(
  kind: TreatmentKind,
  steps: TreatmentStep[],
): boolean {
  const allowed = new Set(typesFor(kind))
  if (
    kind !== 'substrate' &&
    steps.length > 1 &&
    steps.some((step) => step.type === 'direct_load')
  ) {
    return false
  }
  return steps.every((step) => {
    if (!step.type || !allowed.has(step.type)) return false
    if (step.type === 'other' && !step.other_name?.trim()) return false
    if (step.type === 'spin_coat') {
      const stages = spinCoatStages(step.parameters)
      return (
        stages.length > 0 &&
        stages.every(
          (stage) =>
            Number(stage.speed_rpm) > 0 && Number(stage.duration_s) > 0,
        )
      )
    }
    const definitions = definitionsFor(kind, step.type)
    const definitionsValid = definitions.every(
      (definition) =>
        !parameterInvalid(definition, step.parameters[definition.key], true),
    )
    if (!definitionsValid) return false
    const allowedParameterKeys = new Set<string>(
      definitions.map((definition) => definition.key),
    )
    if (definitions.some((definition) => definition.kind === 'atmosphere')) {
      allowedParameterKeys.add('atmosphere_other')
      if (
        canonicalAtmosphere(step.parameters.atmosphere) === 'other' &&
        !atmosphereOtherName(step.parameters).trim()
      ) {
        return false
      }
    }
    const namedMode = namedParametersMode(kind, step.type)
    if (namedMode) allowedParameterKeys.add('items')
    if (
      Object.keys(step.parameters).some((key) => !allowedParameterKeys.has(key))
    ) {
      return false
    }
    if (!namedMode) return true
    const items = step.parameters.items as NamedTreatmentParameter[]
    if (namedMode === 'optional' && (!Array.isArray(items) || !items.length)) {
      return true
    }
    return (
      Array.isArray(items) &&
      items.length > 0 &&
      items.every(
        (item) =>
          item.name.trim() !== '' &&
          String(item.value).trim() !== '' &&
          item.unit.trim() !== '',
      )
    )
  })
}

function SpinCoatStagesEditor({
  stages,
  onChange,
  disabled,
  showErrors,
  labels,
}: {
  stages: SpinCoatStage[]
  onChange: (stages: SpinCoatStage[]) => void
  disabled?: boolean
  showErrors?: boolean
  labels: TreatmentStepsEditorLabels
}) {
  const stable = useStableRowIds(stages.length)
  const baseId = useId()
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= stages.length) return
    const next = [...stages]
    ;[next[index], next[target]] = [next[target], next[index]]
    stable.move(index, target)
    onChange(next)
  }
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{labels.types.spin_coat}</legend>
      {stages.map((stage, index) => {
        const speedInvalid = Boolean(
          showErrors && !(Number(stage.speed_rpm) > 0),
        )
        const durationInvalid = Boolean(
          showErrors && !(Number(stage.duration_s) > 0),
        )
        return (
          <div
            key={stable.ids[index]}
            className="grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <p className="text-sm font-medium sm:col-span-3">
              {labels.spinStage(index + 1)}
            </p>
            <div
              className="flex flex-col gap-1"
              data-invalid={speedInvalid || undefined}
            >
              <Label htmlFor={`${baseId}-${stable.ids[index]}-speed`}>
                {labels.fields.speed_rpm} (rpm) <RequiredMark />
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-speed`}
                type="number"
                min="0"
                step="any"
                value={stage.speed_rpm ?? ''}
                disabled={disabled}
                aria-invalid={speedInvalid || undefined}
                onChange={(event) =>
                  onChange(
                    stages.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            speed_rpm: numberFromInput(event.target.value),
                          }
                        : item,
                    ),
                  )
                }
              />
            </div>
            <div
              className="flex flex-col gap-1"
              data-invalid={durationInvalid || undefined}
            >
              <Label htmlFor={`${baseId}-${stable.ids[index]}-duration`}>
                {labels.fields.duration_s} (s) <RequiredMark />
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-duration`}
                type="number"
                min="0"
                step="any"
                value={stage.duration_s ?? ''}
                disabled={disabled}
                aria-invalid={durationInvalid || undefined}
                onChange={(event) =>
                  onChange(
                    stages.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            duration_s: numberFromInput(event.target.value),
                          }
                        : item,
                    ),
                  )
                }
              />
            </div>
            <div className="flex items-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.moveUp}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.moveDown}
                disabled={disabled || index === stages.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.removeSpinStage}
                disabled={disabled}
                onClick={() => {
                  stable.remove(index)
                  onChange(stages.filter((_, position) => position !== index))
                }}
              >
                <Trash2 />
              </Button>
            </div>
            {speedInvalid || durationInvalid ? (
              <p className="text-destructive text-sm sm:col-span-3">
                {labels.invalidMessage}
              </p>
            ) : null}
          </div>
        )
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            stable.add()
            onChange([...stages, { speed_rpm: null, duration_s: null }])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addSpinStage}
        </Button>
      </div>
    </fieldset>
  )
}

function useStableRowIds(length: number) {
  const prefix = useId().replaceAll(':', '')
  const sequence = useRef(0)
  const ids = useRef<string[]>([])
  while (ids.current.length < length) {
    ids.current.push(`${prefix}-${sequence.current++}`)
  }
  if (ids.current.length > length) ids.current.length = length
  return {
    ids: ids.current,
    add() {
      ids.current.push(`${prefix}-${sequence.current++}`)
    },
    remove(index: number) {
      ids.current.splice(index, 1)
    },
    move(index: number, target: number) {
      ;[ids.current[index], ids.current[target]] = [
        ids.current[target],
        ids.current[index],
      ]
    },
  }
}

function NamedParametersEditor({
  items,
  onChange,
  disabled,
  showErrors,
  labels,
}: {
  items: NamedTreatmentParameter[]
  onChange: (items: NamedTreatmentParameter[]) => void
  disabled?: boolean
  showErrors?: boolean
  labels: TreatmentStepsEditorLabels
}) {
  const stable = useStableRowIds(items.length)
  const baseId = useId()

  const update = (index: number, patch: Partial<NamedTreatmentParameter>) => {
    onChange(
      items.map((item, position) =>
        position === index ? { ...item, ...patch } : item,
      ),
    )
  }
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    stable.move(index, target)
    onChange(next)
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{labels.addParameter}</legend>
      {items.map((item, index) => {
        const invalid =
          Boolean(showErrors) &&
          (!item.name.trim() || !String(item.value).trim() || !item.unit.trim())
        return (
          <div
            key={stable.ids[index]}
            data-row-id={stable.ids[index]}
            data-invalid={invalid || undefined}
            className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stable.ids[index]}-name`}>
                {labels.parameterName} <RequiredMark />
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-name`}
                value={item.name}
                aria-invalid={(showErrors && !item.name.trim()) || undefined}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stable.ids[index]}-value`}>
                {labels.parameterValue} <RequiredMark />
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-value`}
                value={item.value}
                aria-invalid={
                  (showErrors && !String(item.value).trim()) || undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  update(index, { value: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stable.ids[index]}-unit`}>
                {labels.parameterUnit} <RequiredMark />
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-unit`}
                value={item.unit}
                aria-invalid={(showErrors && !item.unit.trim()) || undefined}
                disabled={disabled}
                onChange={(event) =>
                  update(index, { unit: event.target.value })
                }
              />
            </div>
            <div className="flex items-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.moveUp}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.moveDown}
                disabled={disabled || index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={labels.removeParameter}
                disabled={disabled}
                onClick={() => {
                  stable.remove(index)
                  onChange(items.filter((_, position) => position !== index))
                }}
              >
                <Trash2 />
              </Button>
            </div>
            {invalid ? (
              <p className="text-destructive text-sm sm:col-span-4">
                {labels.requiredMessage}
              </p>
            ) : null}
          </div>
        )
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            stable.add()
            onChange([...items, { name: '', value: '', unit: '' }])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addParameter}
        </Button>
      </div>
    </fieldset>
  )
}

function TreatmentStepRow({
  rowId,
  kind,
  step,
  position,
  count,
  onChange,
  onMove,
  onRemove,
  disabled,
  showErrors,
  labels,
}: {
  rowId: string
  kind: TreatmentKind
  step: TreatmentStep
  position: number
  count: number
  onChange: (step: TreatmentStep) => void
  onMove: (delta: number) => void
  onRemove: () => void
  disabled?: boolean
  showErrors?: boolean
  labels: TreatmentStepsEditorLabels
}) {
  const baseId = useId()
  const definitions = definitionsFor(kind, step.type)
  const namedItems = Array.isArray(step.parameters.items)
    ? (step.parameters.items as NamedTreatmentParameter[])
    : []

  return (
    <fieldset
      data-row-id={rowId}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-semibold">
        {labels.step(position + 1)}
      </legend>
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.moveUp}
          disabled={disabled || position === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.moveDown}
          disabled={disabled || position === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.removeStep}
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${baseId}-type`}>
          {labels.type} <RequiredMark />
        </Label>
        <Select
          value={step.type}
          disabled={disabled}
          onValueChange={(type) =>
            onChange({
              type: type as TreatmentType,
              parameters: emptyParameters(kind, type as TreatmentType),
            })
          }
        >
          <SelectTrigger
            id={`${baseId}-type`}
            className="w-full"
            aria-invalid={(showErrors && !step.type) || undefined}
          >
            <SelectValue placeholder={labels.selectType} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {typesFor(kind).map((type) => (
                <SelectItem key={type} value={type}>
                  {labels.types[type]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {showErrors && !step.type ? (
          <p className="text-destructive text-sm">{labels.requiredMessage}</p>
        ) : null}
      </div>

      {step.type === 'other' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-other-name`}>
            {labels.otherName} <RequiredMark />
          </Label>
          <Input
            id={`${baseId}-other-name`}
            value={step.other_name ?? ''}
            disabled={disabled}
            aria-invalid={(showErrors && !step.other_name?.trim()) || undefined}
            onChange={(event) =>
              onChange({ ...step, other_name: event.target.value })
            }
          />
          {showErrors && !step.other_name?.trim() ? (
            <p className="text-destructive text-sm">{labels.requiredMessage}</p>
          ) : null}
        </div>
      ) : null}

      {step.type === 'spin_coat' ? (
        <SpinCoatStagesEditor
          stages={spinCoatStages(step.parameters)}
          onChange={(stages) => onChange({ ...step, parameters: { stages } })}
          disabled={disabled}
          showErrors={showErrors}
          labels={labels}
        />
      ) : null}

      {definitions.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {definitions.map((definition) => {
            const id = `${baseId}-${definition.key}`
            const current = step.parameters[definition.key]
            const invalid = parameterInvalid(
              definition,
              current,
              Boolean(showErrors),
            )
            const selectedAtmosphere = canonicalAtmosphere(current)
            return (
              <div
                key={definition.key}
                data-invalid={invalid || undefined}
                className="flex flex-col gap-1"
              >
                <Label htmlFor={id}>
                  {labels.fields[definition.key]}
                  {definition.unit ? ` (${definition.unit})` : ''}
                  {definition.required ? <RequiredMark /> : null}
                </Label>
                {definition.kind === 'atmosphere' ? (
                  <>
                    <Select
                      value={selectedAtmosphere || noAtmosphereValue}
                      disabled={disabled}
                      onValueChange={(value) => {
                        const parameters = { ...step.parameters }
                        if (value === noAtmosphereValue) {
                          delete parameters.atmosphere
                          delete parameters.atmosphere_other
                        } else {
                          parameters.atmosphere = value
                          if (value === 'other') {
                            parameters.atmosphere_other = atmosphereOtherName(
                              step.parameters,
                            )
                          } else {
                            delete parameters.atmosphere_other
                          }
                        }
                        onChange({ ...step, parameters })
                      }}
                    >
                      <SelectTrigger
                        id={id}
                        className="w-full"
                        aria-invalid={invalid || undefined}
                      >
                        <SelectValue placeholder={labels.selectAtmosphere} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value={noAtmosphereValue}>
                            {labels.noAtmosphere}
                          </SelectItem>
                          {atmosphereCodes.map((code) => (
                            <SelectItem key={code} value={code}>
                              {labels.atmosphereOptions[code] ?? code}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {selectedAtmosphere === 'other' ? (
                      <div className="flex flex-col gap-1">
                        <Label htmlFor={`${id}-other`}>
                          {labels.otherAtmosphereName} <RequiredMark />
                        </Label>
                        <Input
                          id={`${id}-other`}
                          value={atmosphereOtherName(step.parameters)}
                          aria-invalid={
                            (showErrors &&
                              !atmosphereOtherName(step.parameters).trim()) ||
                            undefined
                          }
                          disabled={disabled}
                          onChange={(event) =>
                            onChange({
                              ...step,
                              parameters: {
                                ...step.parameters,
                                atmosphere: 'other',
                                atmosphere_other: event.target.value,
                              },
                            })
                          }
                        />
                        {showErrors &&
                        !atmosphereOtherName(step.parameters).trim() ? (
                          <p className="text-destructive text-sm">
                            {labels.requiredMessage}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <Input
                    id={id}
                    type={definition.kind === 'number' ? 'number' : 'text'}
                    inputMode={
                      definition.kind === 'number' ? 'decimal' : undefined
                    }
                    step={definition.kind === 'number' ? 'any' : undefined}
                    min={
                      definition.kind === 'number'
                        ? definition.positive
                          ? 0
                          : definition.min
                        : undefined
                    }
                    value={current == null ? '' : String(current)}
                    aria-invalid={invalid || undefined}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...step,
                        parameters: {
                          ...step.parameters,
                          [definition.key]:
                            definition.kind === 'number'
                              ? numberFromInput(event.target.value)
                              : event.target.value,
                        },
                      })
                    }
                  />
                )}
                {invalid ? (
                  <p className="text-destructive text-sm">
                    {definition.required && parameterMissing(current)
                      ? labels.requiredMessage
                      : labels.invalidMessage}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {namedParametersMode(kind, step.type) ? (
        <NamedParametersEditor
          items={namedItems}
          onChange={(items) =>
            onChange({ ...step, parameters: { ...step.parameters, items } })
          }
          disabled={disabled}
          showErrors={showErrors}
          labels={labels}
        />
      ) : null}
    </fieldset>
  )
}

export function TreatmentStepsEditor({
  kind,
  value,
  onChange,
  disabled,
  showErrors,
  labels,
}: TreatmentStepsEditorProps) {
  const stable = useStableRowIds(value.length)

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    stable.move(index, target)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      {value.map((step, index) => (
        <TreatmentStepRow
          key={stable.ids[index]}
          rowId={stable.ids[index]}
          kind={kind}
          step={step}
          position={index}
          count={value.length}
          onChange={(next) =>
            onChange(
              kind !== 'substrate' && next.type === 'direct_load'
                ? [next]
                : value
                    .map((item, position) => (position === index ? next : item))
                    .filter(
                      (item) =>
                        kind === 'substrate' ||
                        next.type === '' ||
                        item.type !== 'direct_load',
                    ),
            )
          }
          onMove={(delta) => move(index, delta)}
          onRemove={() => {
            stable.remove(index)
            onChange(value.filter((_, position) => position !== index))
          }}
          disabled={disabled}
          showErrors={showErrors}
          labels={labels}
        />
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            disabled ||
            (kind !== 'substrate' &&
              value.some((item) => item.type === 'direct_load'))
          }
          onClick={() => {
            stable.add()
            onChange([...value, { type: '', parameters: {} }])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addStep}
        </Button>
      </div>
    </div>
  )
}
