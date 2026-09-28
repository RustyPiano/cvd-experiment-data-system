import { useId, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'

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
import { RequiredMark } from '@/shared/ui/required-mark'

export interface NamedProcessParameter {
  name: string
  value: string | number
  unit: string
}

export interface NamedParameterEditorLabels {
  add: string
  item: (position: number) => string
  name: string
  value: string
  unit: string
  remove: string
}

export const actualFieldTypes = [
  'plasma',
  'light',
  'electric_field',
  'other',
] as const

export type ActualFieldType = (typeof actualFieldTypes)[number]

const actualFieldParameterKeys = [
  'plasmaPowerW',
  'plasmaGasSpecies',
  'plasmaPressurePa',
  'lightWavelengthNm',
  'lightPowerMw',
  'lightIrradianceMwCm2',
  'lightSourceDistanceMm',
  'electricVoltageV',
  'electricFieldStrengthVCm',
  'electricElectrodeGapMm',
  'electricDirection',
] as const

type ActualFieldParameterKey = (typeof actualFieldParameterKeys)[number]

interface ActualFieldParameterDefinition {
  key: ActualFieldParameterKey
  name: string
  aliases: readonly string[]
  kind: 'number' | 'text'
  unit: string
  unitAliases?: readonly string[]
  required?: boolean
  alternativeGroup?: 'magnitude'
}

const ACTUAL_FIELD_PARAMETER_DEFINITIONS: Record<
  ActualFieldType,
  readonly ActualFieldParameterDefinition[]
> = {
  plasma: [
    {
      key: 'plasmaPowerW',
      name: 'power_W',
      aliases: ['power', 'plasma_power'],
      kind: 'number',
      unit: 'W',
      required: true,
    },
    {
      key: 'plasmaGasSpecies',
      name: 'gas_species',
      aliases: ['gas', 'gas species'],
      kind: 'text',
      unit: '—',
      required: true,
    },
    {
      key: 'plasmaPressurePa',
      name: 'pressure_Pa',
      aliases: ['pressure', 'working_pressure'],
      kind: 'number',
      unit: 'Pa',
      required: true,
    },
  ],
  light: [
    {
      key: 'lightWavelengthNm',
      name: 'wavelength_nm',
      aliases: ['wavelength'],
      kind: 'number',
      unit: 'nm',
      required: true,
    },
    {
      key: 'lightPowerMw',
      name: 'power_mW',
      aliases: ['light_power'],
      kind: 'number',
      unit: 'mW',
      alternativeGroup: 'magnitude',
    },
    {
      key: 'lightIrradianceMwCm2',
      name: 'irradiance_mW_cm2',
      aliases: ['irradiance', 'intensity'],
      kind: 'number',
      unit: 'mW·cm⁻²',
      unitAliases: ['mW/cm2'],
      alternativeGroup: 'magnitude',
    },
    {
      key: 'lightSourceDistanceMm',
      name: 'source_distance_mm',
      aliases: ['source_distance', 'light_source_distance'],
      kind: 'number',
      unit: 'mm',
      required: true,
    },
  ],
  electric_field: [
    {
      key: 'electricVoltageV',
      name: 'voltage_V',
      aliases: ['voltage'],
      kind: 'number',
      unit: 'V',
      alternativeGroup: 'magnitude',
    },
    {
      key: 'electricFieldStrengthVCm',
      name: 'field_strength_V_cm',
      aliases: ['field_strength', 'electric_field_strength'],
      kind: 'number',
      unit: 'V·cm⁻¹',
      unitAliases: ['V/cm'],
      alternativeGroup: 'magnitude',
    },
    {
      key: 'electricElectrodeGapMm',
      name: 'electrode_gap_mm',
      aliases: ['electrode_gap', 'gap'],
      kind: 'number',
      unit: 'mm',
      required: true,
    },
    {
      key: 'electricDirection',
      name: 'direction',
      aliases: ['field_direction'],
      kind: 'text',
      unit: '—',
      required: true,
    },
  ],
  other: [],
}

export interface ActualField {
  field_type: ActualFieldType | ''
  capability_name?: string | null
  start_min: number | null
  end_min: number | null
  parameters: NamedProcessParameter[]
}

export interface FieldParamsEditorLabels {
  addField: string
  field: (position: number) => string
  fieldType: string
  selectFieldType: string
  fieldTypes: Record<ActualFieldType, string>
  startMinutes: string
  endMinutes: string
  removeField: string
  parameterGroups: Record<ActualFieldType, string>
  explicitParameters: Record<ActualFieldParameterKey, string>
  magnitudeHints: Record<'light' | 'electric_field', string>
  otherParameters: string
  parameters: NamedParameterEditorLabels
}

export interface FieldParamsEditorProps {
  value: ActualField[]
  onChange: (value: ActualField[]) => void
  allowedTypes?: readonly ActualFieldType[]
  otherCapabilityNames?: string[]
  disabled?: boolean
  showErrors?: boolean
  labels: FieldParamsEditorLabels
}

function numberFromInput(value: string): number | null {
  return value === '' ? null : Number(value)
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function namedParametersAreValid(parameters: NamedProcessParameter[]): boolean {
  return (
    parameters.length > 0 &&
    parameters.every(
      (parameter) =>
        parameter.name.trim() !== '' &&
        String(parameter.value).trim() !== '' &&
        parameter.unit.trim() !== '',
    )
  )
}

function normalizedParameterToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en-US')
    .replaceAll('²', '2')
    .replace(/[\s_-]+/g, '')
}

function parameterMatchesDefinition(
  parameter: NamedProcessParameter,
  definition: ActualFieldParameterDefinition,
): boolean {
  const acceptedNames = [definition.name, ...definition.aliases].map(
    normalizedParameterToken,
  )
  if (!acceptedNames.includes(normalizedParameterToken(parameter.name))) {
    return false
  }
  if (definition.kind === 'text') return true
  if (!Number.isFinite(Number(parameter.value))) return false
  const acceptedUnits = [
    definition.unit,
    ...(definition.unitAliases ?? []),
  ].map(normalizedParameterToken)
  return acceptedUnits.includes(normalizedParameterToken(parameter.unit))
}

function explicitParameterIndexes(field: ActualField): Map<string, number> {
  const matches = new Map<string, number>()
  const claimed = new Set<number>()
  if (!field.field_type) return matches

  for (const definition of ACTUAL_FIELD_PARAMETER_DEFINITIONS[
    field.field_type
  ]) {
    const index = field.parameters.findIndex(
      (parameter, position) =>
        !claimed.has(position) &&
        parameterMatchesDefinition(parameter, definition),
    )
    if (index >= 0) {
      claimed.add(index)
      matches.set(definition.key, index)
    }
  }
  return matches
}

function explicitFieldParametersAreValid(field: ActualField): boolean {
  if (!field.field_type) return false
  const definitions = ACTUAL_FIELD_PARAMETER_DEFINITIONS[field.field_type]
  const matches = explicitParameterIndexes(field)
  for (const definition of definitions) {
    if (definition.required && !matches.has(definition.key)) return false
    const index = matches.get(definition.key)
    if (
      index != null &&
      definition.kind === 'number' &&
      !(Number(field.parameters[index].value) > 0)
    ) {
      return false
    }
  }
  const alternatives = definitions.filter(
    (definition) => definition.alternativeGroup === 'magnitude',
  )
  return (
    alternatives.length === 0 ||
    alternatives.filter((definition) => matches.has(definition.key)).length ===
      1
  )
}

function setExplicitParameter(
  field: ActualField,
  definition: ActualFieldParameterDefinition,
  value: string,
): ActualField {
  const existingIndex = explicitParameterIndexes(field).get(definition.key)
  const nextParameters = [...field.parameters]
  if (value.trim() === '') {
    if (existingIndex != null) nextParameters.splice(existingIndex, 1)
    return { ...field, parameters: nextParameters }
  }

  const nextValue =
    definition.kind === 'number' && Number.isFinite(Number(value))
      ? Number(value)
      : value
  const parameter: NamedProcessParameter = {
    name: definition.name,
    value: nextValue,
    unit: definition.unit,
  }
  if (existingIndex == null) nextParameters.push(parameter)
  else nextParameters[existingIndex] = parameter
  return { ...field, parameters: nextParameters }
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
  value,
  onChange,
  disabled,
  showErrors,
  labels,
  title,
}: {
  value: NamedProcessParameter[]
  onChange: (value: NamedProcessParameter[]) => void
  disabled?: boolean
  showErrors?: boolean
  labels: NamedParameterEditorLabels
  title?: string
}) {
  const baseId = useId()
  const stable = useStableRowIds(value.length)
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-medium">{title ?? labels.add}</legend>
      {value.map((parameter, index) => (
        <fieldset
          key={stable.ids[index]}
          data-row-id={stable.ids[index]}
          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
        >
          <legend className="px-1 text-xs text-muted-foreground">
            {labels.item(index + 1)}
          </legend>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${stable.ids[index]}-name`}>
              {labels.name}
            </Label>
            <Input
              id={`${baseId}-${stable.ids[index]}-name`}
              value={parameter.name}
              aria-invalid={(showErrors && !parameter.name.trim()) || undefined}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  value.map((item, position) =>
                    position === index
                      ? { ...item, name: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${stable.ids[index]}-value`}>
              {labels.value}
            </Label>
            <Input
              id={`${baseId}-${stable.ids[index]}-value`}
              value={parameter.value}
              aria-invalid={
                (showErrors && !String(parameter.value).trim()) || undefined
              }
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  value.map((item, position) =>
                    position === index
                      ? { ...item, value: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${stable.ids[index]}-unit`}>
              {labels.unit}
            </Label>
            <Input
              id={`${baseId}-${stable.ids[index]}-unit`}
              value={parameter.unit}
              aria-invalid={(showErrors && !parameter.unit.trim()) || undefined}
              disabled={disabled}
              onChange={(event) =>
                onChange(
                  value.map((item, position) =>
                    position === index
                      ? { ...item, unit: event.target.value }
                      : item,
                  ),
                )
              }
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.remove}
              disabled={disabled}
              onClick={() => {
                stable.remove(index)
                onChange(value.filter((_, position) => position !== index))
              }}
            >
              <Trash2 />
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            stable.add()
            onChange([...value, { name: '', value: '', unit: '' }])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.add}
        </Button>
      </div>
    </fieldset>
  )
}

function ExplicitFieldParameters({
  field,
  onChange,
  disabled,
  showErrors,
  labels,
}: {
  field: ActualField
  onChange: (field: ActualField) => void
  disabled?: boolean
  showErrors?: boolean
  labels: FieldParamsEditorLabels
}) {
  const baseId = useId()
  if (!field.field_type) return null

  const definitions = ACTUAL_FIELD_PARAMETER_DEFINITIONS[field.field_type]
  const matches = explicitParameterIndexes(field)
  const explicitIndexes = new Set(matches.values())
  const otherParameters = field.parameters.filter(
    (_, index) => !explicitIndexes.has(index),
  )
  const explicitInvalid = Boolean(
    showErrors && !explicitFieldParametersAreValid(field),
  )
  const selectedAlternatives = definitions.filter(
    (definition) =>
      definition.alternativeGroup === 'magnitude' &&
      matches.has(definition.key),
  ).length

  return (
    <div className="flex flex-col gap-4">
      {definitions.length > 0 ? (
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">
            {labels.parameterGroups[field.field_type]}
          </legend>
          {field.field_type === 'light' ||
          field.field_type === 'electric_field' ? (
            <p
              id={`${baseId}-magnitude-hint`}
              className="text-sm text-muted-foreground sm:col-span-2"
            >
              {labels.magnitudeHints[field.field_type]}
            </p>
          ) : null}
          {definitions.map((definition) => {
            const parameterIndex = matches.get(definition.key)
            const parameter =
              parameterIndex == null
                ? undefined
                : field.parameters[parameterIndex]
            return (
              <div key={definition.key} className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${definition.key}`}>
                  {labels.explicitParameters[definition.key]}
                  {definition.required ? <RequiredMark /> : null}
                </Label>
                <Input
                  id={`${baseId}-${definition.key}`}
                  type={definition.kind === 'number' ? 'number' : 'text'}
                  inputMode={
                    definition.kind === 'number' ? 'decimal' : undefined
                  }
                  min={definition.kind === 'number' ? 0 : undefined}
                  step={definition.kind === 'number' ? 'any' : undefined}
                  value={parameter == null ? '' : String(parameter.value)}
                  aria-describedby={
                    definition.alternativeGroup === 'magnitude'
                      ? `${baseId}-magnitude-hint`
                      : undefined
                  }
                  aria-invalid={
                    (explicitInvalid &&
                      (definition.required
                        ? parameter == null ||
                          (definition.kind === 'number' &&
                            !(Number(parameter.value) > 0))
                        : definition.alternativeGroup === 'magnitude' &&
                          selectedAlternatives !== 1)) ||
                    undefined
                  }
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      setExplicitParameter(
                        field,
                        definition,
                        event.target.value,
                      ),
                    )
                  }
                />
              </div>
            )
          })}
        </fieldset>
      ) : null}
      <NamedParametersEditor
        value={otherParameters}
        onChange={(nextOtherParameters) => {
          const explicitParameters = field.parameters.filter((_, index) =>
            explicitIndexes.has(index),
          )
          onChange({
            ...field,
            parameters: [...explicitParameters, ...nextOtherParameters],
          })
        }}
        disabled={disabled}
        showErrors={showErrors}
        labels={labels.parameters}
        title={labels.otherParameters}
      />
    </div>
  )
}

export function fieldParamsAreValid(
  value: ActualField[],
  allowedTypes: readonly ActualFieldType[] = actualFieldTypes,
  otherCapabilityNames?: string[],
): boolean {
  const allowed = new Set(allowedTypes)
  return value.every(
    (field) =>
      Boolean(field.field_type && allowed.has(field.field_type)) &&
      (field.field_type !== 'other'
        ? !field.capability_name
        : otherCapabilityNames === undefined ||
          (field.capability_name
            ? otherCapabilityNames.includes(field.capability_name)
            : otherCapabilityNames.length === 1)) &&
      isFiniteNumber(field.start_min) &&
      field.start_min >= 0 &&
      isFiniteNumber(field.end_min) &&
      field.end_min > field.start_min &&
      namedParametersAreValid(field.parameters) &&
      explicitFieldParametersAreValid(field),
  )
}

export function FieldParamsEditor({
  value,
  onChange,
  allowedTypes = actualFieldTypes,
  otherCapabilityNames,
  disabled,
  showErrors,
  labels,
}: FieldParamsEditorProps) {
  const baseId = useId()
  const stable = useStableRowIds(value.length)
  return (
    <div className="flex flex-col gap-3">
      {value.map((field, index) => (
        <fieldset
          key={stable.ids[index]}
          data-row-id={stable.ids[index]}
          className="flex flex-col gap-3 rounded-md border border-border p-4"
        >
          <legend className="px-1 text-sm font-semibold">
            {labels.field(index + 1)}
          </legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stable.ids[index]}-type`}>
                {labels.fieldType}
              </Label>
              <Select
                value={
                  field.field_type === 'other' && otherCapabilityNames?.length
                    ? `other:${field.capability_name ?? (otherCapabilityNames.length === 1 ? otherCapabilityNames[0] : '')}`
                    : field.field_type
                }
                disabled={disabled}
                onValueChange={(fieldType) =>
                  onChange(
                    value.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            field_type: (fieldType.startsWith('other:')
                              ? 'other'
                              : fieldType) as ActualFieldType,
                            capability_name: fieldType.startsWith('other:')
                              ? fieldType.slice(6)
                              : undefined,
                            parameters: [],
                          }
                        : item,
                    ),
                  )
                }
              >
                <SelectTrigger
                  id={`${baseId}-${stable.ids[index]}-type`}
                  className="w-full"
                  aria-invalid={(showErrors && !field.field_type) || undefined}
                >
                  <SelectValue placeholder={labels.selectFieldType} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {allowedTypes.flatMap((fieldType) =>
                      fieldType === 'other' && otherCapabilityNames?.length
                        ? otherCapabilityNames.map((name) => (
                            <SelectItem
                              key={`other:${name}`}
                              value={`other:${name}`}
                            >
                              {name}
                            </SelectItem>
                          ))
                        : [
                            <SelectItem key={fieldType} value={fieldType}>
                              {labels.fieldTypes[fieldType]}
                            </SelectItem>,
                          ],
                    )}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stable.ids[index]}-start`}>
                {labels.startMinutes}
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-start`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={field.start_min ?? ''}
                aria-invalid={
                  (showErrors &&
                    (!isFiniteNumber(field.start_min) ||
                      field.start_min < 0)) ||
                  undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    value.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            start_min: numberFromInput(event.target.value),
                          }
                        : item,
                    ),
                  )
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stable.ids[index]}-end`}>
                {labels.endMinutes}
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-end`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={field.end_min ?? ''}
                aria-invalid={
                  (showErrors &&
                    (!isFiniteNumber(field.end_min) ||
                      !isFiniteNumber(field.start_min) ||
                      field.end_min <= field.start_min)) ||
                  undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    value.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            end_min: numberFromInput(event.target.value),
                          }
                        : item,
                    ),
                  )
                }
              />
            </div>
          </div>
          <ExplicitFieldParameters
            field={field}
            disabled={disabled}
            showErrors={showErrors}
            labels={labels}
            onChange={(nextField) =>
              onChange(
                value.map((item, position) =>
                  position === index ? nextField : item,
                ),
              )
            }
          />
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                stable.remove(index)
                onChange(value.filter((_, position) => position !== index))
              }}
            >
              <Trash2 data-icon="inline-start" />
              {labels.removeField}
            </Button>
          </div>
        </fieldset>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            stable.add()
            onChange([
              ...value,
              {
                field_type: '',
                start_min: null,
                end_min: null,
                parameters: [],
              },
            ])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addField}
        </Button>
      </div>
    </div>
  )
}
