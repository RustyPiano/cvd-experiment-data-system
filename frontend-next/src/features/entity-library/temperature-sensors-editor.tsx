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
import { RequiredMark } from '@/shared/ui/required-mark'

const commonSensorTypes = [
  { value: 'thermocouple', label: 'thermocouple' },
  { value: 'rtd', label: 'rtd' },
  { value: 'infrared_thermometer', label: 'infraredThermometer' },
  {
    value: 'fiber_optic_temperature_sensor',
    label: 'fiberOpticTemperatureSensor',
  },
  { value: 'thermistor', label: 'thermistor' },
] as const
const commonSensorTypeValues = new Set<string>(
  commonSensorTypes.map(({ value }) => value),
)
type SensorTypeLabelKey = (typeof commonSensorTypes)[number]['label']

export interface TemperatureSensor {
  sensor_type: string
  sensor_type_other?: string
  zone_index: number | null
  nominal_accuracy_C?: number | null
}

export interface TemperatureSensorsEditorLabels {
  sensor: (zoneIndex: number) => string
  sensorType: string
  sensorTypeOptions: Record<SensorTypeLabelKey, string>
  selectSensorType: string
  otherSensorType: string
  otherSensorTypePlaceholder: string
  nominalAccuracyCelsius: string
  selectZoneCountFirst: string
  requiredMessage: string
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
  const typeIsValid =
    commonSensorTypeValues.has(sensor.sensor_type) ||
    (sensor.sensor_type === 'other' &&
      Boolean(sensor.sensor_type_other?.trim()))
  return (
    typeIsValid &&
    isFiniteNumber(sensor.zone_index) &&
    Number.isInteger(sensor.zone_index) &&
    sensor.zone_index >= 1 &&
    (zoneCount == null || sensor.zone_index <= zoneCount) &&
    (sensor.nominal_accuracy_C == null ||
      (isFiniteNumber(sensor.nominal_accuracy_C) &&
        sensor.nominal_accuracy_C >= 0))
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
    sensor_type: '',
    zone_index: zoneIndex,
    nominal_accuracy_C: null,
  }
}

/**
 * Setup 的温区数是传感器卡片的唯一结构来源。优先按既有 zone_index
 * 对齐；缺号或重复时再按原顺序填入空缺温区，并始终重写自动编号。
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
              <Label htmlFor={`${baseId}-${zoneIndex}-type`}>
                {labels.sensorType} <RequiredMark />
              </Label>
              <Select
                value={sensor.sensor_type}
                disabled={disabled}
                onValueChange={(sensorType) =>
                  update(index, {
                    sensor_type: sensorType,
                    sensor_type_other:
                      sensorType === 'other'
                        ? (sensor.sensor_type_other ?? '')
                        : undefined,
                  })
                }
              >
                <SelectTrigger
                  id={`${baseId}-${zoneIndex}-type`}
                  aria-invalid={
                    (showErrors &&
                      !commonSensorTypeValues.has(sensor.sensor_type) &&
                      sensor.sensor_type !== 'other') ||
                    undefined
                  }
                >
                  <SelectValue placeholder={labels.selectSensorType} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {commonSensorTypes.map(
                      ({ value: sensorTypeValue, label }) => (
                        <SelectItem
                          key={sensorTypeValue}
                          value={sensorTypeValue}
                        >
                          {labels.sensorTypeOptions[label]}
                        </SelectItem>
                      ),
                    )}
                    <SelectItem value="other">
                      {labels.otherSensorType}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {sensor.sensor_type === 'other' ? (
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`${baseId}-${zoneIndex}-other-type`}>
                    {labels.otherSensorType} <RequiredMark />
                  </Label>
                  <Input
                    id={`${baseId}-${zoneIndex}-other-type`}
                    value={sensor.sensor_type_other ?? ''}
                    placeholder={labels.otherSensorTypePlaceholder}
                    aria-invalid={
                      (showErrors && !sensor.sensor_type_other?.trim()) ||
                      undefined
                    }
                    disabled={disabled}
                    onChange={(event) =>
                      update(index, { sensor_type_other: event.target.value })
                    }
                  />
                </div>
              ) : null}
              {showErrors &&
                (!commonSensorTypeValues.has(sensor.sensor_type) &&
                sensor.sensor_type !== 'other' ? (
                  <p className="text-destructive text-sm">
                    {labels.requiredMessage}
                  </p>
                ) : sensor.sensor_type === 'other' &&
                  !sensor.sensor_type_other?.trim() ? (
                  <p className="text-destructive text-sm">
                    {labels.requiredMessage}
                  </p>
                ) : null)}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${baseId}-${zoneIndex}-accuracy`}>
                {labels.nominalAccuracyCelsius}
              </Label>
              <Input
                id={`${baseId}-${zoneIndex}-accuracy`}
                type="number"
                inputMode="decimal"
                step="any"
                min={0}
                value={sensor.nominal_accuracy_C ?? ''}
                aria-invalid={
                  (showErrors &&
                    sensor.nominal_accuracy_C != null &&
                    (!isFiniteNumber(sensor.nominal_accuracy_C) ||
                      sensor.nominal_accuracy_C < 0)) ||
                  undefined
                }
                disabled={disabled}
                onChange={(event) =>
                  update(index, {
                    nominal_accuracy_C: numberFromInput(event.target.value),
                  })
                }
              />
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}
