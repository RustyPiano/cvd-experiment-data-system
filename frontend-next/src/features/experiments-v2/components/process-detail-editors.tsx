import { useId, useRef, useState } from 'react'
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
import type { V2EntityRead } from '@/features/entity-library/api'
import type { FileAssetRead } from '@/shared/types/api'
import {
  entityMatchesGas,
  gasSpecies,
  materialLotMatchesGas,
  snapshotPurity,
} from './gas-feeds-editor'
import type { GasSpecies, MaterialLotReference } from './gas-feeds-editor'
import { EntityReferenceSelect } from './entity-reference-select'
import { ExperimentAttachments } from './experiment-attachments'
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

interface PumpDownOperation {
  operation_type: 'pump_down'
  target_absolute_pressure_Pa: number | null
  duration_min: number | null
}

export interface PreparationGas {
  species: GasSpecies | ''
  other_name?: string | null
  lot_ref: MaterialLotReference | null
  flow_sccm: number | null
}

interface GasExchangeOperation {
  operation_type: 'gas_exchange'
  cycle_count: number | null
  duration_min: number | null
  gases: PreparationGas[]
}

interface OtherPreparationOperation {
  operation_type: 'other'
  other_name: string
  parameters: NamedProcessParameter[]
}

interface EmptyPreparationOperation {
  operation_type: ''
}

export type PreparationOperation =
  | PumpDownOperation
  | GasExchangeOperation
  | OtherPreparationOperation
  | EmptyPreparationOperation

export interface PreparationOperationsEditorLabels {
  addOperation: string
  operation: (position: number) => string
  operationType: string
  selectOperationType: string
  operationTypes: Record<
    Exclude<PreparationOperation['operation_type'], ''>,
    string
  >
  moveUp: string
  moveDown: string
  removeOperation: string
  targetAbsolutePressurePa: string
  durationMinutes: string
  cycleCount: string
  addGas: string
  gas: (position: number) => string
  species: string
  selectSpecies: string
  speciesOptions: Record<GasSpecies, string>
  otherGasName: string
  gasCylinderLot: string
  purity: string
  flowSccm: string
  removeGas: string
  otherOperationName: string
  parameters: NamedParameterEditorLabels
}

export interface PreparationOperationsEditorProps {
  value: PreparationOperation[]
  onChange: (value: PreparationOperation[]) => void
  disabled?: boolean
  showErrors?: boolean
  labels: PreparationOperationsEditorLabels
}

export interface DurationCycles {
  duration_min: number | null
  cycle_count?: number | null
}

export interface DurationCyclesEditorLabels {
  durationMinutes: string
}

export interface DurationCyclesEditorProps {
  value: DurationCycles
  onChange: (value: DurationCycles) => void
  disabled?: boolean
  showErrors?: boolean
  labels: DurationCyclesEditorLabels
}

export const coolingMethods = [
  'furnace_cooling',
  'open_lid_cooling',
  'rapid_furnace_move_cooling',
  'other',
] as const

export type CoolingMethod = (typeof coolingMethods)[number]

export interface CoolingParams {
  method: CoolingMethod | ''
  lid_open_temperature_C?: number | null
  cooling_rate_C_per_min?: number | null
  method_other?: string | null
}

export interface CoolingParamsEditorLabels {
  method: string
  selectMethod: string
  methods: Record<CoolingMethod, string>
  lidOpenTemperatureC: string
  coolingRateCPerMin: string
  otherMethod: string
  clear: string
}

export interface CoolingParamsEditorProps {
  value: CoolingParams | null
  onChange: (value: CoolingParams | null) => void
  disabled?: boolean
  showErrors?: boolean
  labels: CoolingParamsEditorLabels
}

export const actualFieldTypes = ['plasma', 'light', 'electric_field'] as const

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
}

export interface ActualField {
  field_type: ActualFieldType | ''
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
  otherParameters: string
  parameters: NamedParameterEditorLabels
}

export interface FieldParamsEditorProps {
  value: ActualField[]
  onChange: (value: ActualField[]) => void
  allowedTypes?: readonly ActualFieldType[]
  disabled?: boolean
  showErrors?: boolean
  labels: FieldParamsEditorLabels
}

export interface MeasuredTemperatureChannel {
  zone_index: number | null
  column_name: string
}

export interface MeasuredTemperatureReference {
  file_asset_id: string
  time_column: string
  channels: MeasuredTemperatureChannel[]
}

export interface MeasuredTemperatureEditorLabels {
  files: string
  file: string
  selectFile: string
  clearFile: string
  timeColumn: string
  addChannel: string
  channel: (position: number) => string
  zoneIndex: string
  columnName: string
  removeChannel: string
}

export interface MeasuredTemperatureEditorProps {
  runId: string
  value: MeasuredTemperatureReference | null
  onChange: (value: MeasuredTemperatureReference | null) => void
  zoneCount?: number | null
  disabled?: boolean
  showErrors?: boolean
  saved?: boolean
  labels: MeasuredTemperatureEditorLabels
}

function numberFromInput(value: string): number | null {
  return value === '' ? null : Number(value)
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

function isPositive(value: number | null | undefined): value is number {
  return isFiniteNumber(value) && value > 0
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

function operationForType(
  operationType: Exclude<PreparationOperation['operation_type'], ''>,
): PreparationOperation {
  if (operationType === 'pump_down') {
    return {
      operation_type: operationType,
      target_absolute_pressure_Pa: null,
      duration_min: null,
    }
  }
  if (operationType === 'gas_exchange') {
    return {
      operation_type: operationType,
      cycle_count: null,
      duration_min: null,
      gases: [],
    }
  }
  return {
    operation_type: operationType,
    other_name: '',
    parameters: [],
  }
}

function gasIsValid(gas: PreparationGas): boolean {
  return (
    Boolean(gas.species) &&
    (gas.species === 'other') === Boolean(gas.other_name?.trim()) &&
    Boolean(
      gas.lot_ref?.entity_id &&
      Number.isInteger(gas.lot_ref.version) &&
      gas.lot_ref.version >= 1 &&
      materialLotMatchesGas(gas.lot_ref.snapshot, gas.species, gas.other_name),
    ) &&
    isPositive(gas.flow_sccm)
  )
}

export function preparationOperationsAreValid(
  operations: PreparationOperation[],
): boolean {
  return (
    operations.length > 0 &&
    operations.every((operation) => {
      if (operation.operation_type === 'pump_down') {
        return (
          isPositive(operation.target_absolute_pressure_Pa) &&
          isPositive(operation.duration_min)
        )
      }
      if (operation.operation_type === 'gas_exchange') {
        return (
          Number.isInteger(operation.cycle_count) &&
          isPositive(operation.cycle_count) &&
          isPositive(operation.duration_min) &&
          operation.gases.length > 0 &&
          operation.gases.every(gasIsValid)
        )
      }
      if (operation.operation_type === 'other') {
        return (
          operation.other_name.trim() !== '' &&
          namedParametersAreValid(operation.parameters)
        )
      }
      return false
    })
  )
}

function GasExchangeEditor({
  value,
  onChange,
  disabled,
  showErrors,
  labels,
}: {
  value: GasExchangeOperation
  onChange: (value: GasExchangeOperation) => void
  disabled?: boolean
  showErrors?: boolean
  labels: PreparationOperationsEditorLabels
}) {
  const baseId = useId()
  const stable = useStableRowIds(value.gases.length)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-cycles`}>{labels.cycleCount}</Label>
          <Input
            id={`${baseId}-cycles`}
            type="number"
            inputMode="numeric"
            step={1}
            min={1}
            value={value.cycle_count ?? ''}
            aria-invalid={
              (showErrors &&
                (!Number.isInteger(value.cycle_count) ||
                  !isPositive(value.cycle_count))) ||
              undefined
            }
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                cycle_count: numberFromInput(event.target.value),
              })
            }
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-duration`}>{labels.durationMinutes}</Label>
          <Input
            id={`${baseId}-duration`}
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={value.duration_min ?? ''}
            aria-invalid={
              (showErrors && !isPositive(value.duration_min)) || undefined
            }
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                duration_min: numberFromInput(event.target.value),
              })
            }
          />
        </div>
      </div>
      {value.gases.map((gas, index) => (
        <fieldset
          key={stable.ids[index]}
          data-row-id={stable.ids[index]}
          className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
        >
          <legend className="px-1 text-sm font-medium">
            {labels.gas(index + 1)}
          </legend>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${stable.ids[index]}-species`}>
              {labels.species}
            </Label>
            <Select
              value={gas.species}
              disabled={disabled}
              onValueChange={(species) => {
                const nextSpecies = species as GasSpecies
                const nextOtherName =
                  species === 'other' ? (gas.other_name ?? '') : null
                onChange({
                  ...value,
                  gases: value.gases.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          species: nextSpecies,
                          other_name: nextOtherName,
                          lot_ref: materialLotMatchesGas(
                            item.lot_ref?.snapshot,
                            nextSpecies,
                            nextOtherName,
                          )
                            ? item.lot_ref
                            : null,
                        }
                      : item,
                  ),
                })
              }}
            >
              <SelectTrigger
                id={`${baseId}-${stable.ids[index]}-species`}
                className="w-full"
                aria-invalid={(showErrors && !gas.species) || undefined}
              >
                <SelectValue placeholder={labels.selectSpecies} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {gasSpecies.map((species) => (
                    <SelectItem key={species} value={species}>
                      {labels.speciesOptions[species]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {gas.species === 'other' ? (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stable.ids[index]}-other`}>
                {labels.otherGasName}
              </Label>
              <Input
                id={`${baseId}-${stable.ids[index]}-other`}
                value={gas.other_name ?? ''}
                aria-invalid={
                  (showErrors && !gas.other_name?.trim()) || undefined
                }
                disabled={disabled}
                onChange={(event) => {
                  const otherName = event.target.value
                  onChange({
                    ...value,
                    gases: value.gases.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            other_name: otherName,
                            lot_ref: materialLotMatchesGas(
                              item.lot_ref?.snapshot,
                              'other',
                              otherName,
                            )
                              ? item.lot_ref
                              : null,
                          }
                        : item,
                    ),
                  })
                }}
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${stable.ids[index]}-lot`}>
              {labels.gasCylinderLot}
            </Label>
            <EntityReferenceSelect
              kind="material_lot"
              triggerId={`${baseId}-${stable.ids[index]}-lot`}
              value={gas.lot_ref?.entity_id ?? ''}
              selectedVersion={gas.lot_ref?.version}
              selectedSnapshot={gas.lot_ref?.snapshot}
              filter={(entity) =>
                entityMatchesGas(entity, gas.species, gas.other_name)
              }
              disabled={disabled}
              onChange={(_entityId: string, entity: V2EntityRead | null) => {
                const version = entity?.latest_version
                onChange({
                  ...value,
                  gases: value.gases.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          lot_ref:
                            entity && version
                              ? {
                                  entity_id: entity.id,
                                  version: version.version,
                                  snapshot: version.data,
                                }
                              : null,
                        }
                      : item,
                  ),
                })
              }}
            />
            {snapshotPurity(gas.lot_ref) ? (
              <p className="text-xs text-muted-foreground">
                {labels.purity}: {snapshotPurity(gas.lot_ref)}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${stable.ids[index]}-flow`}>
              {labels.flowSccm}
            </Label>
            <Input
              id={`${baseId}-${stable.ids[index]}-flow`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0}
              value={gas.flow_sccm ?? ''}
              aria-invalid={
                (showErrors && !isPositive(gas.flow_sccm)) || undefined
              }
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...value,
                  gases: value.gases.map((item, position) =>
                    position === index
                      ? {
                          ...item,
                          flow_sccm: numberFromInput(event.target.value),
                        }
                      : item,
                  ),
                })
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => {
                stable.remove(index)
                onChange({
                  ...value,
                  gases: value.gases.filter(
                    (_, position) => position !== index,
                  ),
                })
              }}
            >
              <Trash2 data-icon="inline-start" />
              {labels.removeGas}
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
            onChange({
              ...value,
              gases: [
                ...value.gases,
                { species: '', lot_ref: null, flow_sccm: null },
              ],
            })
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addGas}
        </Button>
      </div>
    </div>
  )
}

export function PreparationOperationsEditor({
  value,
  onChange,
  disabled,
  showErrors,
  labels,
}: PreparationOperationsEditorProps) {
  const baseId = useId()
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
      {value.map((operation, index) => (
        <fieldset
          key={stable.ids[index]}
          data-row-id={stable.ids[index]}
          className="flex flex-col gap-3 rounded-md border border-border p-4"
        >
          <legend className="px-1 text-sm font-semibold">
            {labels.operation(index + 1)}
          </legend>
          <div className="flex justify-end gap-1">
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
              disabled={disabled || index === value.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={labels.removeOperation}
              disabled={disabled}
              onClick={() => {
                stable.remove(index)
                onChange(value.filter((_, position) => position !== index))
              }}
            >
              <Trash2 />
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-${stable.ids[index]}-type`}>
              {labels.operationType}
            </Label>
            <Select
              value={operation.operation_type}
              disabled={disabled}
              onValueChange={(operationType) =>
                onChange(
                  value.map((item, position) =>
                    position === index
                      ? operationForType(
                          operationType as Exclude<
                            PreparationOperation['operation_type'],
                            ''
                          >,
                        )
                      : item,
                  ),
                )
              }
            >
              <SelectTrigger
                id={`${baseId}-${stable.ids[index]}-type`}
                className="w-full"
                aria-invalid={
                  (showErrors && !operation.operation_type) || undefined
                }
              >
                <SelectValue placeholder={labels.selectOperationType} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {(['pump_down', 'gas_exchange', 'other'] as const).map(
                    (operationType) => (
                      <SelectItem key={operationType} value={operationType}>
                        {labels.operationTypes[operationType]}
                      </SelectItem>
                    ),
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {operation.operation_type === 'pump_down' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${stable.ids[index]}-pressure`}>
                  {labels.targetAbsolutePressurePa}
                </Label>
                <Input
                  id={`${baseId}-${stable.ids[index]}-pressure`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={operation.target_absolute_pressure_Pa ?? ''}
                  aria-invalid={
                    (showErrors &&
                      !isPositive(operation.target_absolute_pressure_Pa)) ||
                    undefined
                  }
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      value.map((item, position) =>
                        position === index &&
                        item.operation_type === 'pump_down'
                          ? {
                              ...item,
                              target_absolute_pressure_Pa: numberFromInput(
                                event.target.value,
                              ),
                            }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${stable.ids[index]}-duration`}>
                  {labels.durationMinutes}
                </Label>
                <Input
                  id={`${baseId}-${stable.ids[index]}-duration`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={operation.duration_min ?? ''}
                  aria-invalid={
                    (showErrors && !isPositive(operation.duration_min)) ||
                    undefined
                  }
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      value.map((item, position) =>
                        position === index &&
                        item.operation_type === 'pump_down'
                          ? {
                              ...item,
                              duration_min: numberFromInput(event.target.value),
                            }
                          : item,
                      ),
                    )
                  }
                />
              </div>
            </div>
          ) : null}
          {operation.operation_type === 'gas_exchange' ? (
            <GasExchangeEditor
              value={operation}
              disabled={disabled}
              showErrors={showErrors}
              labels={labels}
              onChange={(next) =>
                onChange(
                  value.map((item, position) =>
                    position === index ? next : item,
                  ),
                )
              }
            />
          ) : null}
          {operation.operation_type === 'other' ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${stable.ids[index]}-other-name`}>
                  {labels.otherOperationName}
                </Label>
                <Input
                  id={`${baseId}-${stable.ids[index]}-other-name`}
                  value={operation.other_name}
                  aria-invalid={
                    (showErrors && !operation.other_name.trim()) || undefined
                  }
                  disabled={disabled}
                  onChange={(event) =>
                    onChange(
                      value.map((item, position) =>
                        position === index && item.operation_type === 'other'
                          ? { ...item, other_name: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
              <NamedParametersEditor
                value={operation.parameters}
                disabled={disabled}
                showErrors={showErrors}
                labels={labels.parameters}
                onChange={(parameters) =>
                  onChange(
                    value.map((item, position) =>
                      position === index && item.operation_type === 'other'
                        ? { ...item, parameters }
                        : item,
                    ),
                  )
                }
              />
            </div>
          ) : null}
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
            onChange([...value, { operation_type: '' }])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addOperation}
        </Button>
      </div>
    </div>
  )
}

export function durationCyclesAreValid(value: DurationCycles): boolean {
  return (
    isPositive(value.duration_min) &&
    (value.cycle_count == null ||
      (Number.isInteger(value.cycle_count) && value.cycle_count >= 1))
  )
}

export function DurationCyclesEditor({
  value,
  onChange,
  disabled,
  showErrors,
  labels,
}: DurationCyclesEditorProps) {
  const baseId = useId()
  return (
    <div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${baseId}-duration`}>{labels.durationMinutes}</Label>
        <Input
          id={`${baseId}-duration`}
          type="number"
          inputMode="decimal"
          step="any"
          min={0}
          value={value.duration_min ?? ''}
          aria-invalid={
            (showErrors && !isPositive(value.duration_min)) || undefined
          }
          disabled={disabled}
          onChange={(event) =>
            onChange({
              duration_min: numberFromInput(event.target.value),
            })
          }
        />
      </div>
    </div>
  )
}

export function coolingParamsAreValid(value: CoolingParams | null): boolean {
  if (value == null) return true
  if (!value.method || !coolingMethods.includes(value.method)) return false
  if (
    (value.method === 'open_lid_cooling') !==
    isFiniteNumber(value.lid_open_temperature_C)
  ) {
    return false
  }
  if ((value.method === 'other') !== Boolean(value.method_other?.trim())) {
    return false
  }
  return (
    value.cooling_rate_C_per_min == null ||
    isPositive(value.cooling_rate_C_per_min)
  )
}

export function CoolingParamsEditor({
  value,
  onChange,
  disabled,
  showErrors,
  labels,
}: CoolingParamsEditorProps) {
  const baseId = useId()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${baseId}-method`}>{labels.method}</Label>
        <Select
          value={value?.method ?? ''}
          disabled={disabled}
          onValueChange={(method) =>
            onChange({
              method: method as CoolingMethod,
              lid_open_temperature_C:
                method === 'open_lid_cooling'
                  ? (value?.lid_open_temperature_C ?? null)
                  : null,
              cooling_rate_C_per_min: value?.cooling_rate_C_per_min ?? null,
              method_other:
                method === 'other' ? (value?.method_other ?? '') : null,
            })
          }
        >
          <SelectTrigger
            id={`${baseId}-method`}
            className="w-full"
            aria-invalid={(showErrors && !value?.method) || undefined}
          >
            <SelectValue placeholder={labels.selectMethod} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {coolingMethods.map((method) => (
                <SelectItem key={method} value={method}>
                  {labels.methods[method]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {value?.method === 'open_lid_cooling' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-lid-temperature`}>
            {labels.lidOpenTemperatureC}
          </Label>
          <Input
            id={`${baseId}-lid-temperature`}
            type="number"
            inputMode="decimal"
            step="any"
            value={value.lid_open_temperature_C ?? ''}
            aria-invalid={
              (showErrors && !isFiniteNumber(value.lid_open_temperature_C)) ||
              undefined
            }
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                lid_open_temperature_C: numberFromInput(event.target.value),
              })
            }
          />
        </div>
      ) : null}
      {value?.method === 'other' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-other`}>{labels.otherMethod}</Label>
          <Input
            id={`${baseId}-other`}
            value={value.method_other ?? ''}
            aria-invalid={
              (showErrors && !value.method_other?.trim()) || undefined
            }
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, method_other: event.target.value })
            }
          />
        </div>
      ) : null}
      {value ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-rate`}>{labels.coolingRateCPerMin}</Label>
          <Input
            id={`${baseId}-rate`}
            type="number"
            inputMode="decimal"
            step="any"
            min={0}
            value={value.cooling_rate_C_per_min ?? ''}
            aria-invalid={
              (showErrors &&
                value.cooling_rate_C_per_min != null &&
                !isPositive(value.cooling_rate_C_per_min)) ||
              undefined
            }
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                cooling_rate_C_per_min: numberFromInput(event.target.value),
              })
            }
          />
        </div>
      ) : null}
      {value ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            {labels.clear}
          </Button>
        </div>
      ) : null}
    </div>
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
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-1 text-sm font-medium">
          {labels.parameterGroups[field.field_type]}
        </legend>
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
                inputMode={definition.kind === 'number' ? 'decimal' : undefined}
                min={definition.kind === 'number' ? 0 : undefined}
                step={definition.kind === 'number' ? 'any' : undefined}
                value={parameter == null ? '' : String(parameter.value)}
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
                    setExplicitParameter(field, definition, event.target.value),
                  )
                }
              />
            </div>
          )
        })}
      </fieldset>
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
): boolean {
  const allowed = new Set(allowedTypes)
  return value.every(
    (field) =>
      Boolean(field.field_type && allowed.has(field.field_type)) &&
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
                value={field.field_type}
                disabled={disabled}
                onValueChange={(fieldType) =>
                  onChange(
                    value.map((item, position) =>
                      position === index
                        ? {
                            ...item,
                            field_type: fieldType as ActualFieldType,
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
                    {allowedTypes.map((fieldType) => (
                      <SelectItem key={fieldType} value={fieldType}>
                        {labels.fieldTypes[fieldType]}
                      </SelectItem>
                    ))}
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

function channelIsValid(
  channel: MeasuredTemperatureChannel,
  channels: MeasuredTemperatureChannel[],
  zoneCount?: number | null,
): boolean {
  return (
    isFiniteNumber(channel.zone_index) &&
    Number.isInteger(channel.zone_index) &&
    channel.zone_index >= 1 &&
    (zoneCount == null || channel.zone_index <= zoneCount) &&
    channels.filter((item) => item.zone_index === channel.zone_index).length ===
      1 &&
    channel.column_name.trim() !== '' &&
    channels.filter(
      (item) => item.column_name.trim() === channel.column_name.trim(),
    ).length === 1
  )
}

interface TemperatureTimeseriesMetadata {
  columns: string[]
  numericColumns: string[]
}

function temperatureTimeseriesMetadata(
  file: FileAssetRead | undefined,
): TemperatureTimeseriesMetadata | null {
  if (!file) return null
  const columns = file.metadata_json.columns
  const numericColumns = file.metadata_json.numeric_columns
  const rowCount = file.metadata_json.row_count
  if (
    !Array.isArray(columns) ||
    !columns.every((column): column is string => typeof column === 'string') ||
    !Array.isArray(numericColumns) ||
    numericColumns.length < 2 ||
    !numericColumns.every(
      (column): column is string =>
        typeof column === 'string' && columns.includes(column),
    ) ||
    typeof rowCount !== 'number' ||
    rowCount < 1
  ) {
    return null
  }
  return { columns, numericColumns }
}

function suggestedMeasuredTemperature(
  file: FileAssetRead,
  zoneCount?: number | null,
): MeasuredTemperatureReference {
  const numericColumns =
    temperatureTimeseriesMetadata(file)?.numericColumns ?? []
  const timeColumn =
    numericColumns.find((column) =>
      /(^|[_\s-])(time|timestamp|elapsed|minutes?|mins?|seconds?|secs?)($|[_\s-])|\u65f6\u95f4|\u65f6\u957f/i.test(
        column,
      ),
    ) ??
    numericColumns[0] ??
    ''
  const remaining = numericColumns.filter((column) => column !== timeColumn)
  const channelCount = Math.min(zoneCount ?? remaining.length, remaining.length)
  const channels: MeasuredTemperatureChannel[] = []
  for (let zoneIndex = 1; zoneIndex <= channelCount; zoneIndex += 1) {
    const zonePattern = new RegExp(
      `(?:zone|temperature|temp|z|t)[_\\s-]*0?${zoneIndex}(?:\\D|$)|\\u6e29\\u533a[_\\s-]*${zoneIndex}(?:\\D|$)`,
      'i',
    )
    const columnIndex = remaining.findIndex(
      (column) =>
        !channels.some((channel) => channel.column_name === column) &&
        zonePattern.test(column),
    )
    const columnName =
      (columnIndex >= 0
        ? remaining[columnIndex]
        : remaining.find(
            (column) =>
              !channels.some((channel) => channel.column_name === column),
          )) ?? ''
    channels.push({ zone_index: zoneIndex, column_name: columnName })
  }
  return {
    file_asset_id: file.id,
    time_column: timeColumn,
    channels,
  }
}

export function measuredTemperatureIsValid(
  value: MeasuredTemperatureReference | null,
  zoneCount?: number | null,
): boolean {
  if (value == null) return true
  return (
    value.file_asset_id.trim() !== '' &&
    value.time_column.trim() !== '' &&
    value.channels.length > 0 &&
    !value.channels.some(
      (channel) => channel.column_name.trim() === value.time_column.trim(),
    ) &&
    value.channels.every((channel) =>
      channelIsValid(channel, value.channels, zoneCount),
    )
  )
}

function nextZoneIndex(
  channels: MeasuredTemperatureChannel[],
  zoneCount?: number | null,
): number | null {
  const used = new Set(channels.map((channel) => channel.zone_index))
  const limit = zoneCount ?? channels.length + 1
  for (let index = 1; index <= limit; index += 1) {
    if (!used.has(index)) return index
  }
  return null
}

export function MeasuredTemperatureEditor({
  runId,
  value,
  onChange,
  zoneCount,
  disabled,
  showErrors,
  saved,
  labels,
}: MeasuredTemperatureEditorProps) {
  const baseId = useId()
  const [files, setFiles] = useState<FileAssetRead[]>([])
  const stable = useStableRowIds(value?.channels.length ?? 0)
  const selectedFile = files.find((file) => file.id === value?.file_asset_id)
  const numericColumns =
    temperatureTimeseriesMetadata(selectedFile)?.numericColumns ?? []
  const temperatureColumns = numericColumns.filter(
    (column) => column !== value?.time_column,
  )
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">{labels.files}</legend>
        <ExperimentAttachments
          runId={runId}
          role="temperature_timeseries"
          bindingType="process_step"
          bindingId="reaction_conditions"
          readOnly={Boolean(disabled)}
          cleanupUncommitted
          saved={saved}
          onFilesChange={setFiles}
        />
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${baseId}-file`}>{labels.file}</Label>
        <Select
          value={value?.file_asset_id ?? ''}
          disabled={disabled || files.length === 0}
          onValueChange={(fileAssetId) => {
            const file = files.find((item) => item.id === fileAssetId)
            if (file) onChange(suggestedMeasuredTemperature(file, zoneCount))
          }}
        >
          <SelectTrigger
            id={`${baseId}-file`}
            className="w-full"
            aria-invalid={
              (showErrors && value != null && !value.file_asset_id) || undefined
            }
          >
            <SelectValue placeholder={labels.selectFile} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {files.map((file) => (
                <SelectItem key={file.id} value={file.id}>
                  {file.original_name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {value ? (
        <>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(null)}
            >
              {labels.clearFile}
            </Button>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-time-column`}>{labels.timeColumn}</Label>
            <Select
              value={value.time_column}
              disabled={disabled || numericColumns.length === 0}
              onValueChange={(timeColumn) =>
                onChange({
                  ...value,
                  time_column: timeColumn,
                  channels: value.channels.map((channel) =>
                    channel.column_name === timeColumn
                      ? { ...channel, column_name: '' }
                      : channel,
                  ),
                })
              }
            >
              <SelectTrigger
                id={`${baseId}-time-column`}
                className="w-full"
                aria-invalid={
                  (showErrors && !numericColumns.includes(value.time_column)) ||
                  undefined
                }
              >
                <SelectValue placeholder={labels.timeColumn} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {numericColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {value.channels.map((channel, index) => (
            <fieldset
              key={stable.ids[index]}
              data-row-id={stable.ids[index]}
              className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_2fr_auto]"
            >
              <legend className="px-1 text-sm font-medium">
                {labels.channel(index + 1)}
              </legend>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${stable.ids[index]}-zone`}>
                  {labels.zoneIndex}
                </Label>
                <Input
                  id={`${baseId}-${stable.ids[index]}-zone`}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  max={zoneCount ?? undefined}
                  value={channel.zone_index ?? ''}
                  aria-invalid={
                    (showErrors &&
                      !channelIsValid(channel, value.channels, zoneCount)) ||
                    undefined
                  }
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      channels: value.channels.map((item, position) =>
                        position === index
                          ? {
                              ...item,
                              zone_index: numberFromInput(event.target.value),
                            }
                          : item,
                      ),
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${stable.ids[index]}-column`}>
                  {labels.columnName}
                </Label>
                <Select
                  value={channel.column_name}
                  disabled={disabled || temperatureColumns.length === 0}
                  onValueChange={(columnName) =>
                    onChange({
                      ...value,
                      channels: value.channels.map((item, position) =>
                        position === index
                          ? { ...item, column_name: columnName }
                          : item,
                      ),
                    })
                  }
                >
                  <SelectTrigger
                    id={`${baseId}-${stable.ids[index]}-column`}
                    className="w-full"
                    aria-invalid={
                      (showErrors &&
                        !temperatureColumns.includes(channel.column_name)) ||
                      undefined
                    }
                  >
                    <SelectValue placeholder={labels.columnName} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {temperatureColumns.map((column) => (
                        <SelectItem
                          key={column}
                          value={column}
                          disabled={value.channels.some(
                            (item, position) =>
                              position !== index && item.column_name === column,
                          )}
                        >
                          {column}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.removeChannel}
                  disabled={disabled}
                  onClick={() => {
                    stable.remove(index)
                    onChange({
                      ...value,
                      channels: value.channels.filter(
                        (_, position) => position !== index,
                      ),
                    })
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
              disabled={
                disabled ||
                (zoneCount != null && value.channels.length >= zoneCount) ||
                !temperatureColumns.some(
                  (column) =>
                    !value.channels.some(
                      (channel) => channel.column_name === column,
                    ),
                )
              }
              onClick={() => {
                const columnName =
                  temperatureColumns.find(
                    (column) =>
                      !value.channels.some(
                        (channel) => channel.column_name === column,
                      ),
                  ) ?? ''
                stable.add()
                onChange({
                  ...value,
                  channels: [
                    ...value.channels,
                    {
                      zone_index: nextZoneIndex(value.channels, zoneCount),
                      column_name: columnName,
                    },
                  ],
                })
              }}
            >
              <Plus data-icon="inline-start" />
              {labels.addChannel}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  )
}
