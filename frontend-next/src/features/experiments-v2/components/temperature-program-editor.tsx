import { useId, useRef } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface TemperaturePoint {
  elapsed_min: number | null
  setpoint_C: number | null
}

export interface TemperatureZone {
  zone_index: number | null
  points: TemperaturePoint[]
}

export interface TemperatureProgram {
  zones: TemperatureZone[]
}

export interface TemperatureProgramEditorLabels {
  addZone: string
  zone: (position: number) => string
  zoneIndex: string
  removeZone: string
  addPoint: string
  point: (position: number) => string
  elapsedMinutes: string
  setpointCelsius: string
  removePoint: string
  moveUp: string
  moveDown: string
}

export interface TemperatureProgramEditorProps {
  value: TemperatureProgram
  onChange: (value: TemperatureProgram) => void
  zoneCount?: number | null
  disabled?: boolean
  showErrors?: boolean
  labels: TemperatureProgramEditorLabels
}

function isFiniteNumber(value: number | null): value is number {
  return value != null && Number.isFinite(value)
}

function zoneIndexIsValid(
  index: number | null,
  zones: TemperatureZone[],
  zoneCount?: number | null,
): boolean {
  return (
    isFiniteNumber(index) &&
    Number.isInteger(index) &&
    index >= 1 &&
    (zoneCount == null || index <= zoneCount) &&
    zones.filter((zone) => zone.zone_index === index).length === 1
  )
}

function pointIsValid(point: TemperaturePoint): boolean {
  return (
    isFiniteNumber(point.elapsed_min) &&
    point.elapsed_min >= 0 &&
    isFiniteNumber(point.setpoint_C) &&
    point.setpoint_C > -273.15
  )
}

export function temperatureProgramIsValid(
  value: TemperatureProgram,
  zoneCount?: number | null,
): boolean {
  const valid =
    value.zones.length > 0 &&
    value.zones.every(
      (zone) =>
        zoneIndexIsValid(zone.zone_index, value.zones, zoneCount) &&
        zone.points.length > 0 &&
        zone.points.every(pointIsValid) &&
        zone.points[0].elapsed_min === 0 &&
        zone.points.every(
          (point, index) =>
            index === 0 ||
            (point.elapsed_min as number) >
              (zone.points[index - 1].elapsed_min as number),
        ),
    )
  if (!valid || zoneCount == null) return valid
  const indices = value.zones
    .map((zone) => zone.zone_index as number)
    .sort((left, right) => left - right)
  return (
    indices.length === zoneCount &&
    indices.every((zone, index) => zone === index + 1)
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

function TemperatureZoneRow({
  rowId,
  zone,
  zones,
  position,
  zoneCount,
  disabled,
  showErrors,
  labels,
  onChange,
  onMove,
  onRemove,
}: {
  rowId: string
  zone: TemperatureZone
  zones: TemperatureZone[]
  position: number
  zoneCount?: number | null
  disabled?: boolean
  showErrors?: boolean
  labels: TemperatureProgramEditorLabels
  onChange: (zone: TemperatureZone) => void
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  const baseId = useId()
  const stablePoints = useStableRowIds(zone.points.length)

  const movePoint = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= zone.points.length) return
    const points = [...zone.points]
    ;[points[index], points[target]] = [points[target], points[index]]
    stablePoints.move(index, target)
    onChange({ ...zone, points })
  }

  return (
    <fieldset
      data-row-id={rowId}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-semibold">
        {labels.zone(position + 1)}
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
          disabled={disabled || position === zones.length - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={labels.removeZone}
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${baseId}-zone-index`}>{labels.zoneIndex}</Label>
        <Input
          id={`${baseId}-zone-index`}
          type="number"
          inputMode="numeric"
          step={1}
          min={1}
          max={zoneCount ?? undefined}
          value={zone.zone_index ?? ''}
          aria-invalid={
            (showErrors &&
              !zoneIndexIsValid(zone.zone_index, zones, zoneCount)) ||
            undefined
          }
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...zone,
              zone_index: numberFromInput(event.target.value),
            })
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        {zone.points.map((point, index) => {
          const previous = zone.points[index - 1]
          const elapsedInvalid =
            !isFiniteNumber(point.elapsed_min) ||
            point.elapsed_min < 0 ||
            (index === 0
              ? point.elapsed_min !== 0
              : isFiniteNumber(previous?.elapsed_min ?? null) &&
                point.elapsed_min <= (previous?.elapsed_min as number))
          const setpointInvalid =
            !isFiniteNumber(point.setpoint_C) || point.setpoint_C <= -273.15
          return (
            <fieldset
              key={stablePoints.ids[index]}
              data-row-id={stablePoints.ids[index]}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
              <legend className="px-1 text-sm font-medium">
                {labels.point(index + 1)}
              </legend>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${baseId}-${stablePoints.ids[index]}-elapsed`}>
                  {labels.elapsedMinutes}
                </Label>
                <Input
                  id={`${baseId}-${stablePoints.ids[index]}-elapsed`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={point.elapsed_min ?? ''}
                  aria-invalid={(showErrors && elapsedInvalid) || undefined}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...zone,
                      points: zone.points.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              elapsed_min: numberFromInput(event.target.value),
                            }
                          : item,
                      ),
                    })
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label
                  htmlFor={`${baseId}-${stablePoints.ids[index]}-setpoint`}
                >
                  {labels.setpointCelsius}
                </Label>
                <Input
                  id={`${baseId}-${stablePoints.ids[index]}-setpoint`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={-273.15}
                  value={point.setpoint_C ?? ''}
                  aria-invalid={(showErrors && setpointInvalid) || undefined}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...zone,
                      points: zone.points.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              setpoint_C: numberFromInput(event.target.value),
                            }
                          : item,
                      ),
                    })
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
                  onClick={() => movePoint(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.moveDown}
                  disabled={disabled || index === zone.points.length - 1}
                  onClick={() => movePoint(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.removePoint}
                  disabled={disabled}
                  onClick={() => {
                    stablePoints.remove(index)
                    onChange({
                      ...zone,
                      points: zone.points.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }}
                >
                  <Trash2 />
                </Button>
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
              stablePoints.add()
              onChange({
                ...zone,
                points: [
                  ...zone.points,
                  { elapsed_min: null, setpoint_C: null },
                ],
              })
            }}
          >
            <Plus data-icon="inline-start" />
            {labels.addPoint}
          </Button>
        </div>
      </div>
    </fieldset>
  )
}

function nextZoneIndex(
  zones: TemperatureZone[],
  zoneCount?: number | null,
): number | null {
  const used = new Set(zones.map((zone) => zone.zone_index))
  if (zoneCount != null) {
    for (let index = 1; index <= zoneCount; index += 1) {
      if (!used.has(index)) return index
    }
    return null
  }
  const indices = zones
    .map((zone) => zone.zone_index)
    .filter((index): index is number => index != null)
  return indices.length === 0 ? 1 : Math.max(...indices) + 1
}

export function TemperatureProgramEditor({
  value,
  onChange,
  zoneCount,
  disabled,
  showErrors,
  labels,
}: TemperatureProgramEditorProps) {
  const stableZones = useStableRowIds(value.zones.length)

  const moveZone = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= value.zones.length) return
    const zones = [...value.zones]
    ;[zones[index], zones[target]] = [zones[target], zones[index]]
    stableZones.move(index, target)
    onChange({ zones })
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-invalid={
        (showErrors && !temperatureProgramIsValid(value, zoneCount)) ||
        undefined
      }
    >
      {value.zones.map((zone, index) => (
        <TemperatureZoneRow
          key={stableZones.ids[index]}
          rowId={stableZones.ids[index]}
          zone={zone}
          zones={value.zones}
          position={index}
          zoneCount={zoneCount}
          disabled={disabled}
          showErrors={showErrors}
          labels={labels}
          onChange={(next) =>
            onChange({
              zones: value.zones.map((item, itemIndex) =>
                itemIndex === index ? next : item,
              ),
            })
          }
          onMove={(delta) => moveZone(index, delta)}
          onRemove={() => {
            stableZones.remove(index)
            onChange({
              zones: value.zones.filter((_, itemIndex) => itemIndex !== index),
            })
          }}
        />
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            stableZones.add()
            onChange({
              zones: [
                ...value.zones,
                {
                  zone_index: nextZoneIndex(value.zones, zoneCount),
                  points: [{ elapsed_min: 0, setpoint_C: null }],
                },
              ],
            })
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addZone}
        </Button>
      </div>
    </div>
  )
}
