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

export const temperatureUncertaintySources = [
  'instrument',
  'calibration',
  'repeatability',
  'estimate',
] as const

export type TemperatureUncertaintySource =
  (typeof temperatureUncertaintySources)[number]

export interface TemperatureSensor {
  sensor_name: string
  sensor_type: string
  zone_index: number | null
  uncertainty_C: number | null
  uncertainty_source: TemperatureUncertaintySource | ''
}

export interface TemperatureSensorsEditorLabels {
  addSensor: string
  sensor: (position: number) => string
  sensorName: string
  sensorType: string
  zoneIndex: string
  uncertaintyCelsius: string
  uncertaintySource: string
  selectUncertaintySource: string
  uncertaintySourceOptions: Record<TemperatureUncertaintySource, string>
  removeSensor: string
  moveUp: string
  moveDown: string
}

export interface TemperatureSensorsEditorProps {
  value: TemperatureSensor[]
  onChange: (value: TemperatureSensor[]) => void
  zoneCount?: number | null
  disabled?: boolean
  showErrors?: boolean
  labels: TemperatureSensorsEditorLabels
}

function isFiniteNumber(value: number | null): value is number {
  return value != null && Number.isFinite(value)
}

function sensorIsValid(
  sensor: TemperatureSensor,
  zoneCount?: number | null,
): boolean {
  return (
    sensor.sensor_name.trim() !== '' &&
    sensor.sensor_type.trim() !== '' &&
    isFiniteNumber(sensor.zone_index) &&
    Number.isInteger(sensor.zone_index) &&
    sensor.zone_index >= 1 &&
    (zoneCount == null || sensor.zone_index <= zoneCount) &&
    isFiniteNumber(sensor.uncertainty_C) &&
    sensor.uncertainty_C >= 0 &&
    temperatureUncertaintySources.includes(
      sensor.uncertainty_source as TemperatureUncertaintySource,
    )
  )
}

export function temperatureSensorsAreValid(
  value: TemperatureSensor[],
  zoneCount?: number | null,
): boolean {
  if (
    value.length === 0 ||
    !value.every((sensor) => sensorIsValid(sensor, zoneCount))
  ) {
    return false
  }
  const zones = value.map((sensor) => sensor.zone_index as number)
  if (new Set(zones).size !== zones.length) return false
  return (
    zoneCount == null ||
    (zones.length === zoneCount &&
      zones
        .slice()
        .sort((left, right) => left - right)
        .every((zone, index) => zone === index + 1))
  )
}

function numberFromInput(value: string): number | null {
  return value === '' ? null : Number(value)
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

export function TemperatureSensorsEditor({
  value,
  onChange,
  zoneCount,
  disabled,
  showErrors,
  labels,
}: TemperatureSensorsEditorProps) {
  const baseId = useId()
  const stableSensors = useStableRowIds(value.length)

  const update = (index: number, patch: Partial<TemperatureSensor>) => {
    onChange(
      value.map((sensor, itemIndex) =>
        itemIndex === index ? { ...sensor, ...patch } : sensor,
      ),
    )
  }
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    stableSensors.move(index, target)
    onChange(next)
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-invalid={
        (showErrors && !temperatureSensorsAreValid(value, zoneCount)) ||
        undefined
      }
    >
      {value.map((sensor, index) => {
        const invalid = !sensorIsValid(sensor, zoneCount)
        return (
          <fieldset
            key={stableSensors.ids[index]}
            data-row-id={stableSensors.ids[index]}
            data-invalid={(showErrors && invalid) || undefined}
            className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2"
          >
            <legend className="px-1 text-sm font-semibold">
              {labels.sensor(index + 1)}
            </legend>
            <div className="col-span-full flex justify-end gap-1">
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
                aria-label={labels.removeSensor}
                disabled={disabled}
                onClick={() => {
                  stableSensors.remove(index)
                  onChange(value.filter((_, itemIndex) => itemIndex !== index))
                }}
              >
                <Trash2 />
              </Button>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stableSensors.ids[index]}-name`}>
                {labels.sensorName}
              </Label>
              <Input
                id={`${baseId}-${stableSensors.ids[index]}-name`}
                value={sensor.sensor_name}
                aria-invalid={
                  (showErrors && !sensor.sensor_name.trim()) || undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  update(index, { sensor_name: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stableSensors.ids[index]}-type`}>
                {labels.sensorType}
              </Label>
              <Input
                id={`${baseId}-${stableSensors.ids[index]}-type`}
                value={sensor.sensor_type}
                aria-invalid={
                  (showErrors && !sensor.sensor_type.trim()) || undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  update(index, { sensor_type: event.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${stableSensors.ids[index]}-zone`}>
                {labels.zoneIndex}
              </Label>
              <Input
                id={`${baseId}-${stableSensors.ids[index]}-zone`}
                type="number"
                inputMode="numeric"
                step={1}
                min={1}
                max={zoneCount ?? undefined}
                value={sensor.zone_index ?? ''}
                aria-invalid={
                  (showErrors &&
                    (!isFiniteNumber(sensor.zone_index) ||
                      !Number.isInteger(sensor.zone_index) ||
                      sensor.zone_index < 1 ||
                      (zoneCount != null && sensor.zone_index > zoneCount))) ||
                  undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  update(index, {
                    zone_index: numberFromInput(event.target.value),
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label
                htmlFor={`${baseId}-${stableSensors.ids[index]}-uncertainty`}
              >
                {labels.uncertaintyCelsius}
              </Label>
              <Input
                id={`${baseId}-${stableSensors.ids[index]}-uncertainty`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={sensor.uncertainty_C ?? ''}
                aria-invalid={
                  (showErrors &&
                    (!isFiniteNumber(sensor.uncertainty_C) ||
                      sensor.uncertainty_C < 0)) ||
                  undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  update(index, {
                    uncertainty_C: numberFromInput(event.target.value),
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor={`${baseId}-${stableSensors.ids[index]}-source`}>
                {labels.uncertaintySource}
              </Label>
              <Select
                value={sensor.uncertainty_source}
                disabled={disabled}
                onValueChange={(source) =>
                  update(index, {
                    uncertainty_source: source as TemperatureUncertaintySource,
                  })
                }
              >
                <SelectTrigger
                  id={`${baseId}-${stableSensors.ids[index]}-source`}
                  className="w-full"
                  aria-invalid={
                    (showErrors && !sensor.uncertainty_source) || undefined
                  }
                >
                  <SelectValue placeholder={labels.selectUncertaintySource} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {temperatureUncertaintySources.map((source) => (
                      <SelectItem key={source} value={source}>
                        {labels.uncertaintySourceOptions[source]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </fieldset>
        )
      })}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            stableSensors.add()
            onChange([
              ...value,
              {
                sensor_name: '',
                sensor_type: '',
                zone_index: null,
                uncertainty_C: null,
                uncertainty_source: '',
              },
            ])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addSensor}
        </Button>
      </div>
    </div>
  )
}
