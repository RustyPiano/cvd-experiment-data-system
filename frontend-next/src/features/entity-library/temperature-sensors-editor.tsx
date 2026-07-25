import { useId } from 'react'

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
  sensor: (zoneIndex: number) => string
  sensorName: string
  sensorType: string
  uncertaintyCelsius: string
  uncertaintySource: string
  selectUncertaintySource: string
  uncertaintySourceOptions: Record<TemperatureUncertaintySource, string>
  selectZoneCountFirst: string
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

function emptySensor(zoneIndex: number): TemperatureSensor {
  return {
    sensor_name: '',
    sensor_type: '',
    zone_index: zoneIndex,
    uncertainty_C: null,
    uncertainty_source: '',
  }
}

/**
 * Setup 的温区数是传感器卡片的唯一结构来源。优先按既有 zone_index
 * 对齐；旧数据缺号或重复时再按原顺序填入空缺温区，并始终重写自动编号。
 */
export function reconcileTemperatureSensors(
  value: TemperatureSensor[],
  zoneCount?: number | null,
): TemperatureSensor[] {
  if (zoneCount == null || !Number.isInteger(zoneCount) || zoneCount < 1) {
    return []
  }

  const assigned = new Map<number, TemperatureSensor>()
  const usedRows = new Set<number>()
  for (let zoneIndex = 1; zoneIndex <= zoneCount; zoneIndex += 1) {
    const rowIndex = value.findIndex(
      (sensor, index) =>
        !usedRows.has(index) && sensor.zone_index === zoneIndex,
    )
    if (rowIndex >= 0) {
      assigned.set(zoneIndex, value[rowIndex])
      usedRows.add(rowIndex)
    }
  }
  const leftovers = value.filter((_, index) => !usedRows.has(index))
  let fallbackIndex = 0

  return Array.from({ length: zoneCount }, (_, index) => {
    const zoneIndex = index + 1
    const source = assigned.get(zoneIndex) ?? leftovers[fallbackIndex++]
    return {
      ...(source ?? emptySensor(zoneIndex)),
      zone_index: zoneIndex,
    }
  })
}

function numberFromInput(value: string): number | null {
  return value === '' ? null : Number(value)
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
  const sensors = reconcileTemperatureSensors(value, zoneCount)

  const update = (index: number, patch: Partial<TemperatureSensor>) => {
    onChange(
      sensors.map((sensor, itemIndex) =>
        itemIndex === index ? { ...sensor, ...patch } : sensor,
      ),
    )
  }

  if (sensors.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {labels.selectZoneCountFirst}
      </p>
    )
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-invalid={
        (showErrors && !temperatureSensorsAreValid(sensors, zoneCount)) ||
        undefined
      }
    >
      {sensors.map((sensor, index) => {
        const zoneIndex = index + 1
        const invalid = !sensorIsValid(sensor, zoneCount)
        return (
          <fieldset
            key={zoneIndex}
            data-row-id={`zone-${zoneIndex}`}
            data-invalid={(showErrors && invalid) || undefined}
            className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2"
          >
            <legend className="px-1 text-sm font-semibold">
              {labels.sensor(zoneIndex)}
            </legend>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${zoneIndex}-name`}>
                {labels.sensorName}
              </Label>
              <Input
                id={`${baseId}-${zoneIndex}-name`}
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
              <Label htmlFor={`${baseId}-${zoneIndex}-type`}>
                {labels.sensorType}
              </Label>
              <Input
                id={`${baseId}-${zoneIndex}-type`}
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
              <Label htmlFor={`${baseId}-${zoneIndex}-uncertainty`}>
                {labels.uncertaintyCelsius}
              </Label>
              <Input
                id={`${baseId}-${zoneIndex}-uncertainty`}
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
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${zoneIndex}-source`}>
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
                  id={`${baseId}-${zoneIndex}-source`}
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
    </div>
  )
}
