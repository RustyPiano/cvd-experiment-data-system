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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { V2EntityRead } from '@/features/entity-library/api'
import { canonicalOption } from '@/shared/field-i18n'
import { EntityReferenceSelect } from './entity-reference-select'
import { snapshotValue } from './reference-snapshot'

export const gasSpecies = ['Ar', 'N2', 'H2', 'O2', 'CH4', 'other'] as const
export const gasMeasurementSources = ['mfc', 'rotameter', 'other'] as const

export type GasSpecies = (typeof gasSpecies)[number]
export type GasMeasurementSource = (typeof gasMeasurementSources)[number]

export interface MaterialLotReference {
  entity_id: string
  version: number
  snapshot: Record<string, unknown>
}

export interface GasSupplyInterval {
  start_min: number | null
  end_min: number | null
  flow_sccm: number | null
}

export interface GasFeed {
  species: GasSpecies | ''
  other_name?: string | null
  lot_ref: MaterialLotReference | null
  measurement_source?: GasMeasurementSource | '' | null
  measurement_source_other?: string | null
  intervals: GasSupplyInterval[]
}

export interface GasFeedsEditorLabels {
  addFeed: string
  feed: (position: number) => string
  species: string
  selectSpecies: string
  speciesOptions: Record<GasSpecies, string>
  otherGasName: string
  lotReference: string
  purity: string
  measurementSource: string
  selectMeasurementSource: string
  measurementSourceOptions: Record<GasMeasurementSource, string>
  otherMeasurementSource: string
  addInterval: string
  interval: (position: number) => string
  startMinutes: string
  endMinutes: string
  flowSccm: string
  removeFeed: string
  removeInterval: string
  moveUp: string
  moveDown: string
  flowShareTitle: string
  flowShareDescription: string
  flowShareInterval: string
  flowShareComposition: string
}

export interface GasFeedsEditorProps {
  value: GasFeed[]
  onChange: (value: GasFeed[]) => void
  disabled?: boolean
  showErrors?: boolean
  labels: GasFeedsEditorLabels
}

function isFiniteNumber(value: number | null): value is number {
  return value != null && Number.isFinite(value)
}

function intervalIsValid(interval: GasSupplyInterval): boolean {
  return (
    isFiniteNumber(interval.start_min) &&
    interval.start_min >= 0 &&
    isFiniteNumber(interval.end_min) &&
    interval.end_min > interval.start_min &&
    isFiniteNumber(interval.flow_sccm) &&
    interval.flow_sccm > 0
  )
}

function intervalsDoNotOverlap(intervals: GasSupplyInterval[]): boolean {
  if (!intervals.every(intervalIsValid)) return false
  const ordered = [...intervals].sort(
    (left, right) => (left.start_min as number) - (right.start_min as number),
  )
  return ordered.every(
    (interval, index) =>
      index === 0 ||
      (interval.start_min as number) >= (ordered[index - 1].end_min as number),
  )
}

export interface GasFlowShareSegment {
  interval_index: number
  start_min: number
  end_min: number
  total_flow_sccm: number
  shares: {
    feed_index: number
    species: GasFeed['species']
    other_name?: string | null
    flow_sccm: number
    percent: number
  }[]
}

export function deriveGasFlowShareSegments(
  feeds: readonly GasFeed[],
): GasFlowShareSegment[] {
  const intervals = feeds.flatMap((feed, feedIndex) =>
    feed.intervals.flatMap((interval) => {
      const { start_min: start, end_min: end, flow_sccm: flow } = interval
      return isFiniteNumber(start) &&
        start >= 0 &&
        isFiniteNumber(end) &&
        end > start &&
        isFiniteNumber(flow) &&
        flow >= 0
        ? [{ feed, feedIndex, start, end, flow }]
        : []
    }),
  )
  const boundaries = [
    ...new Set(intervals.flatMap(({ start, end }) => [start, end])),
  ].sort((left, right) => left - right)

  const segments: GasFlowShareSegment[] = []
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index]
    const end = boundaries[index + 1]
    const flows = new Map<number, { feed: GasFeed; flow_sccm: number }>()
    for (const interval of intervals) {
      if (interval.start <= start && interval.end >= end && interval.flow > 0) {
        const current = flows.get(interval.feedIndex)
        flows.set(interval.feedIndex, {
          feed: interval.feed,
          flow_sccm: (current?.flow_sccm ?? 0) + interval.flow,
        })
      }
    }
    const total = [...flows.values()].reduce(
      (sum, item) => sum + item.flow_sccm,
      0,
    )
    if (total <= 0) continue
    segments.push({
      interval_index: segments.length + 1,
      start_min: start,
      end_min: end,
      total_flow_sccm: total,
      shares: [...flows.entries()].map(([feedIndex, item]) => ({
        feed_index: feedIndex + 1,
        species: item.feed.species,
        other_name: item.feed.other_name,
        flow_sccm: item.flow_sccm,
        percent: (item.flow_sccm / total) * 100,
      })),
    })
  }
  return segments
}

export function gasFeedsAreValid(value: GasFeed[]): boolean {
  const validSpecies = new Set(gasSpecies)
  const validMeasurementSources = new Set(gasMeasurementSources)
  return (
    value.length > 0 &&
    value.every(
      (feed) =>
        Boolean(feed.species && validSpecies.has(feed.species)) &&
        (feed.species === 'other') === Boolean(feed.other_name?.trim()) &&
        Boolean(
          feed.lot_ref?.entity_id &&
          Number.isInteger(feed.lot_ref.version) &&
          feed.lot_ref.version >= 1 &&
          materialLotMatchesGas(
            feed.lot_ref.snapshot,
            feed.species,
            feed.other_name,
          ),
        ) &&
        (!feed.measurement_source ||
          validMeasurementSources.has(feed.measurement_source)) &&
        (feed.measurement_source === 'other') ===
          Boolean(feed.measurement_source_other?.trim()) &&
        feed.intervals.length > 0 &&
        intervalsDoNotOverlap(feed.intervals),
    )
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

export function snapshotPurity(
  reference: MaterialLotReference | null,
): string | null {
  const purity = snapshotValue(reference?.snapshot, 'purity')
  const grade = snapshotValue(reference?.snapshot, 'gas_purity_grade')
  const values = [purity == null || purity === '' ? null : `${purity}%`, grade]
    .filter((value) => value != null && value !== '')
    .map(String)
  return values.length > 0 ? values.join(' · ') : null
}

const gasAliases: Record<Exclude<GasSpecies, 'other'>, readonly string[]> = {
  Ar: ['ar', 'argon', '氩', '氩气'],
  N2: ['n2', 'nitrogen', '氮', '氮气'],
  H2: ['h2', 'hydrogen', '氢', '氢气'],
  O2: ['o2', 'oxygen', '氧', '氧气'],
  CH4: ['ch4', 'methane', '甲烷'],
}

function normalizedGasIdentity(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (digit) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(digit)))
    .replace(/[\s_-]+/g, '')
}

export function materialLotMatchesGas(
  snapshot: Record<string, unknown> | null | undefined,
  species: GasSpecies | '',
  otherName?: string | null,
): boolean {
  if (
    canonicalOption(String(snapshotValue(snapshot, 'lot_category') ?? '')) !==
    'gas_cylinder'
  ) {
    return false
  }
  if (!species) return true
  const identities = ['chemical_formula', 'substance_name']
    .map((key) => normalizedGasIdentity(snapshotValue(snapshot, key)))
    .filter(Boolean)
  const expected =
    species === 'other'
      ? [normalizedGasIdentity(otherName)]
      : gasAliases[species]
  return (
    expected.some(Boolean) &&
    identities.some((identity) => expected.includes(identity))
  )
}

export function entityMatchesGas(
  entity: V2EntityRead,
  species: GasSpecies | '',
  otherName?: string | null,
): boolean {
  return materialLotMatchesGas(entity.latest_version?.data, species, otherName)
}

function GasFeedRow({
  rowId,
  feed,
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
  feed: GasFeed
  position: number
  count: number
  onChange: (feed: GasFeed) => void
  onMove: (delta: number) => void
  onRemove: () => void
  disabled?: boolean
  showErrors?: boolean
  labels: GasFeedsEditorLabels
}) {
  const baseId = useId()
  const stableIntervals = useStableRowIds(feed.intervals.length)
  const purity = snapshotPurity(feed.lot_ref)

  const moveInterval = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= feed.intervals.length) return
    const intervals = [...feed.intervals]
    ;[intervals[index], intervals[target]] = [
      intervals[target],
      intervals[index],
    ]
    stableIntervals.move(index, target)
    onChange({ ...feed, intervals })
  }

  return (
    <fieldset
      data-row-id={rowId}
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <legend className="px-1 text-sm font-semibold">
        {labels.feed(position + 1)}
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
          aria-label={labels.removeFeed}
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-species`}>{labels.species}</Label>
          <Select
            value={feed.species}
            disabled={disabled}
            onValueChange={(species) => {
              const nextSpecies = species as GasSpecies
              const nextOtherName =
                species === 'other' ? (feed.other_name ?? '') : null
              onChange({
                ...feed,
                species: nextSpecies,
                other_name: nextOtherName,
                lot_ref: materialLotMatchesGas(
                  feed.lot_ref?.snapshot,
                  nextSpecies,
                  nextOtherName,
                )
                  ? feed.lot_ref
                  : null,
              })
            }}
          >
            <SelectTrigger
              id={`${baseId}-species`}
              className="w-full"
              aria-invalid={(showErrors && !feed.species) || undefined}
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
        {feed.species === 'other' ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-other-name`}>
              {labels.otherGasName}
            </Label>
            <Input
              id={`${baseId}-other-name`}
              value={feed.other_name ?? ''}
              aria-invalid={
                (showErrors && !feed.other_name?.trim()) || undefined
              }
              disabled={disabled}
              onChange={(event) => {
                const otherName = event.target.value
                onChange({
                  ...feed,
                  other_name: otherName,
                  lot_ref: materialLotMatchesGas(
                    feed.lot_ref?.snapshot,
                    'other',
                    otherName,
                  )
                    ? feed.lot_ref
                    : null,
                })
              }}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-lot-reference`}>
            {labels.lotReference}
          </Label>
          <EntityReferenceSelect
            kind="material_lot"
            triggerId={`${baseId}-lot-reference`}
            value={feed.lot_ref?.entity_id ?? ''}
            selectedVersion={feed.lot_ref?.version}
            selectedSnapshot={feed.lot_ref?.snapshot}
            disabled={disabled}
            filter={(entity) =>
              entityMatchesGas(entity, feed.species, feed.other_name)
            }
            onChange={(_entityId: string, entity: V2EntityRead | null) => {
              const version = entity?.latest_version
              onChange({
                ...feed,
                lot_ref:
                  entity && version
                    ? {
                        entity_id: entity.id,
                        version: version.version,
                        snapshot: version.data,
                      }
                    : null,
              })
            }}
          />
          {purity ? (
            <p className="text-xs text-muted-foreground">
              {labels.purity}: {purity}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor={`${baseId}-measurement-source`}>
            {labels.measurementSource}
          </Label>
          <Select
            value={feed.measurement_source ?? ''}
            disabled={disabled}
            onValueChange={(source) =>
              onChange({
                ...feed,
                measurement_source: source as GasMeasurementSource,
                measurement_source_other:
                  source === 'other'
                    ? (feed.measurement_source_other ?? '')
                    : null,
              })
            }
          >
            <SelectTrigger
              id={`${baseId}-measurement-source`}
              className="w-full"
            >
              <SelectValue placeholder={labels.selectMeasurementSource} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {gasMeasurementSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {labels.measurementSourceOptions[source]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {feed.measurement_source === 'other' ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${baseId}-measurement-source-other`}>
              {labels.otherMeasurementSource}
            </Label>
            <Input
              id={`${baseId}-measurement-source-other`}
              value={feed.measurement_source_other ?? ''}
              aria-invalid={
                (showErrors && !feed.measurement_source_other?.trim()) ||
                undefined
              }
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  ...feed,
                  measurement_source_other: event.target.value,
                })
              }
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        {feed.intervals.map((interval, index) => {
          const overlap =
            intervalIsValid(interval) &&
            feed.intervals.some(
              (candidate, candidateIndex) =>
                candidateIndex !== index &&
                intervalIsValid(candidate) &&
                (interval.start_min as number) <
                  (candidate.end_min as number) &&
                (candidate.start_min as number) < (interval.end_min as number),
            )
          return (
            <fieldset
              key={stableIntervals.ids[index]}
              data-row-id={stableIntervals.ids[index]}
              data-invalid={
                (showErrors && (!intervalIsValid(interval) || overlap)) ||
                undefined
              }
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <legend className="px-1 text-sm font-medium">
                {labels.interval(index + 1)}
              </legend>
              {(
                [
                  ['start_min', labels.startMinutes, 0],
                  ['end_min', labels.endMinutes, 0],
                  ['flow_sccm', labels.flowSccm, 0],
                ] as const
              ).map(([key, label, min]) => {
                const raw = interval[key]
                const invalid =
                  !isFiniteNumber(raw) ||
                  raw < min ||
                  (key !== 'start_min' && raw <= 0) ||
                  (key === 'end_min' &&
                    isFiniteNumber(interval.start_min) &&
                    raw <= interval.start_min) ||
                  overlap
                return (
                  <div key={key} className="flex flex-col gap-1">
                    <Label
                      htmlFor={`${baseId}-${stableIntervals.ids[index]}-${key}`}
                    >
                      {label}
                    </Label>
                    <Input
                      id={`${baseId}-${stableIntervals.ids[index]}-${key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={min}
                      value={raw ?? ''}
                      aria-invalid={(showErrors && invalid) || undefined}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange({
                          ...feed,
                          intervals: feed.intervals.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  [key]: numberFromInput(event.target.value),
                                }
                              : item,
                          ),
                        })
                      }
                    />
                  </div>
                )
              })}
              <div className="flex items-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.moveUp}
                  disabled={disabled || index === 0}
                  onClick={() => moveInterval(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.moveDown}
                  disabled={disabled || index === feed.intervals.length - 1}
                  onClick={() => moveInterval(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={labels.removeInterval}
                  disabled={disabled}
                  onClick={() => {
                    stableIntervals.remove(index)
                    onChange({
                      ...feed,
                      intervals: feed.intervals.filter(
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
              stableIntervals.add()
              onChange({
                ...feed,
                intervals: [
                  ...feed.intervals,
                  { start_min: null, end_min: null, flow_sccm: null },
                ],
              })
            }}
          >
            <Plus data-icon="inline-start" />
            {labels.addInterval}
          </Button>
        </div>
      </div>
    </fieldset>
  )
}

export function GasFeedsEditor({
  value,
  onChange,
  disabled,
  showErrors,
  labels,
}: GasFeedsEditorProps) {
  const stableFeeds = useStableRowIds(value.length)
  const shareSegments = deriveGasFlowShareSegments(value)

  const moveFeed = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= value.length) return
    const next = [...value]
    ;[next[index], next[target]] = [next[target], next[index]]
    stableFeeds.move(index, target)
    onChange(next)
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-invalid={(showErrors && !gasFeedsAreValid(value)) || undefined}
    >
      {value.map((feed, index) => (
        <GasFeedRow
          key={stableFeeds.ids[index]}
          rowId={stableFeeds.ids[index]}
          feed={feed}
          position={index}
          count={value.length}
          disabled={disabled}
          showErrors={showErrors}
          labels={labels}
          onChange={(next) =>
            onChange(
              value.map((item, itemIndex) =>
                itemIndex === index ? next : item,
              ),
            )
          }
          onMove={(delta) => moveFeed(index, delta)}
          onRemove={() => {
            stableFeeds.remove(index)
            onChange(value.filter((_, itemIndex) => itemIndex !== index))
          }}
        />
      ))}
      {shareSegments.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div>
            <h4 className="text-sm font-medium">{labels.flowShareTitle}</h4>
            <p className="text-xs text-muted-foreground">
              {labels.flowShareDescription}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.flowShareInterval}</TableHead>
                <TableHead>{labels.flowShareComposition}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shareSegments.map((segment) => (
                <TableRow key={segment.interval_index}>
                  <TableCell className="tabular-nums">
                    {formatGasNumber(segment.start_min)}–
                    {formatGasNumber(segment.end_min)} min
                  </TableCell>
                  <TableCell>
                    {segment.shares
                      .map((share) => {
                        const gas =
                          share.species === 'other'
                            ? share.other_name || labels.speciesOptions.other
                            : labels.speciesOptions[
                                share.species as GasSpecies
                              ] || labels.feed(share.feed_index)
                        return `${gas}: ${formatGasNumber(share.flow_sccm)} sccm · ${formatGasNumber(share.percent)}%`
                      })
                      .join('; ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            stableFeeds.add()
            onChange([
              ...value,
              {
                species: '',
                lot_ref: null,
                measurement_source: null,
                intervals: [
                  { start_min: null, end_min: null, flow_sccm: null },
                ],
              },
            ])
          }}
        >
          <Plus data-icon="inline-start" />
          {labels.addFeed}
        </Button>
      </div>
    </div>
  )
}

function formatGasNumber(value: number): string {
  return String(Number(value.toFixed(2)))
}
