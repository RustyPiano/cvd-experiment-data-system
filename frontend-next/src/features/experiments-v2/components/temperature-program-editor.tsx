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
  zone: (zoneIndex: number) => string
  addPoint: string
  point: (position: number) => string
  elapsedMinutes: string
  setpointCelsius: string
  removePoint: string
  moveUp: string
  moveDown: string
  selectSetupFirst: string
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

function emptyZone(zoneIndex: number): TemperatureZone {
  return {
    zone_index: zoneIndex,
    points: [{ elapsed_min: 0, setpoint_C: null }],
  }
}

/**
 * 温度程序的温区结构只来自已选 Setup。既有数据优先按 zone_index 对齐，
 * 旧的缺号/重复数据按原顺序补入空位，输出永远覆盖 1..zoneCount。
 */
export function reconcileTemperatureProgram(
  value: TemperatureProgram,
  zoneCount?: number | null,
): TemperatureProgram {
  if (zoneCount == null || !Number.isInteger(zoneCount) || zoneCount < 1) {
    return { zones: [] }
  }

  const assigned = new Map<number, TemperatureZone>()
  const usedRows = new Set<number>()
  for (let zoneIndex = 1; zoneIndex <= zoneCount; zoneIndex += 1) {
    const rowIndex = value.zones.findIndex(
      (zone, index) => !usedRows.has(index) && zone.zone_index === zoneIndex,
    )
    if (rowIndex >= 0) {
      assigned.set(zoneIndex, value.zones[rowIndex])
      usedRows.add(rowIndex)
    }
  }
  const leftovers = value.zones.filter((_, index) => !usedRows.has(index))
  let fallbackIndex = 0

  return {
    zones: Array.from({ length: zoneCount }, (_, index) => {
      const zoneIndex = index + 1
      const source = assigned.get(zoneIndex) ?? leftovers[fallbackIndex++]
      return {
        ...(source ?? emptyZone(zoneIndex)),
        zone_index: zoneIndex,
      }
    }),
  }
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
  zone,
  disabled,
  showErrors,
  labels,
  onChange,
}: {
  zone: TemperatureZone
  disabled?: boolean
  showErrors?: boolean
  labels: TemperatureProgramEditorLabels
  onChange: (zone: TemperatureZone) => void
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
      data-row-id={`zone-${zone.zone_index}`}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-semibold">
        {labels.zone(zone.zone_index as number)}
      </legend>
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

export function TemperatureProgramEditor({
  value,
  onChange,
  zoneCount,
  disabled,
  showErrors,
  labels,
}: TemperatureProgramEditorProps) {
  const program = reconcileTemperatureProgram(value, zoneCount)

  if (program.zones.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{labels.selectSetupFirst}</p>
    )
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-invalid={
        (showErrors && !temperatureProgramIsValid(program, zoneCount)) ||
        undefined
      }
    >
      {program.zones.map((zone, index) => (
        <TemperatureZoneRow
          key={zone.zone_index}
          zone={zone}
          disabled={disabled}
          showErrors={showErrors}
          labels={labels}
          onChange={(next) =>
            onChange({
              zones: program.zones.map((item, itemIndex) =>
                itemIndex === index ? next : item,
              ),
            })
          }
        />
      ))}
    </div>
  )
}
