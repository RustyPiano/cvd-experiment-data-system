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

const commonSensorTypes = [
  { value: 'k_thermocouple', label: 'kThermocouple' },
  { value: 's_thermocouple', label: 'sThermocouple' },
  { value: 'r_thermocouple', label: 'rThermocouple' },
  { value: 'b_thermocouple', label: 'bThermocouple' },
  { value: 'infrared_pyrometer', label: 'infraredPyrometer' },
] as const
const commonSensorTypeValues = new Set<string>(
  commonSensorTypes.map(({ value }) => value),
)
type SensorTypeLabelKey = (typeof commonSensorTypes)[number]['label']
const legacySensorTypes: Record<string, string> = {
  K: 'k_thermocouple',
  'K-type thermocouple': 'k_thermocouple',
  S: 's_thermocouple',
  'S-type thermocouple': 's_thermocouple',
  R: 'r_thermocouple',
  'R-type thermocouple': 'r_thermocouple',
  B: 'b_thermocouple',
  'B-type thermocouple': 'b_thermocouple',
  'Infrared pyrometer': 'infrared_pyrometer',
}

export interface TemperatureSensor {
  sensor_name?: string
  sensor_type: string
  sensor_type_other?: string
  zone_index: number | null
  uncertainty_C: number | null
  uncertainty_source?: string
}

export interface TemperatureSensorsEditorLabels {
  sensor: (zoneIndex: number) => string
  sensorType: string
  sensorTypeOptions: Record<SensorTypeLabelKey, string>
  selectSensorType: string
  otherSensorType: string
  otherSensorTypePlaceholder: string
  uncertaintyCelsius: string
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
    isFiniteNumber(sensor.uncertainty_C) &&
    sensor.uncertainty_C >= 0
  )
}

function normalizeSensorType(sensor: TemperatureSensor): TemperatureSensor {
  const sensorType = legacySensorTypes[sensor.sensor_type] ?? sensor.sensor_type
  if (commonSensorTypeValues.has(sensorType)) {
    return { ...sensor, sensor_type: sensorType, sensor_type_other: undefined }
  }
  if (sensorType === 'other' || !sensorType.trim()) {
    return { ...sensor, sensor_type: sensorType }
  }
  return {
    ...sensor,
    sensor_type: 'other',
    sensor_type_other: sensor.sensor_type_other?.trim() || sensorType,
  }
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
    uncertainty_C: null,
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
    return normalizeSensorType({
      ...(source ?? emptySensor(zoneIndex)),
      zone_index: zoneIndex,
    })
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
                {labels.sensorType}
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
                <Input
                  aria-label={labels.otherSensorType}
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
              ) : null}
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
          </fieldset>
        )
      })}
    </div>
  )
}
