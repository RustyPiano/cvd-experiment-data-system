import { useCallback, useState } from 'react'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'

import type { QuickTemplate } from '../data/builtin-templates'
import { BUILTIN_FURNACE_TEMPLATES } from '../data/builtin-templates'
import type {
  FurnacePlacementValues,
  FurnaceProgramValues,
  FurnaceSegmentValues,
  FurnaceZoneValues,
  PrecursorItemValues,
} from '../editor-types'
import {
  createEmptyFurnacePlacement,
  payloadToFurnaceProgramValues,
  syncFurnaceProgramZonesCount,
} from '../editor-types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { QuickTemplateMenu } from './quick-template-menu'
import { FurnaceProgramChart } from './furnace-program-chart'
import { SubPanel } from './sub-panel'

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return value as Record<string, unknown>
}

function getZoneKeys(zonesCount: number): string[] {
  return Array.from({ length: zonesCount }, (_, i) => `zone_${i + 1}`)
}

function parsePositiveIntegerValue(value: string) {
  const trimmed = value.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null
  }

  const numericValue = Number(trimmed)
  return Number.isSafeInteger(numericValue) ? numericValue : null
}

export function FurnaceProgramSection({
  disabled,
  onChange,
  precursorItems,
  templates = BUILTIN_FURNACE_TEMPLATES,
  value,
}: {
  disabled: boolean
  onChange: (nextValue: FurnaceProgramValues) => void
  precursorItems: PrecursorItemValues[]
  templates?: QuickTemplate[]
  value: FurnaceProgramValues
}) {
  const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<
    string | null
  >(null)

  const parsedZonesCount = parsePositiveIntegerValue(value.furnaceInfo.zonesCount)
  const zonesCount = parsedZonesCount ?? 2
  const zoneKeys = getZoneKeys(zonesCount)
  const precursorOptions = precursorItems.map((item, index) => ({
    label: item.species.trim() || `前驱体 ${index + 1}`,
    value: String(index),
  }))

  const emitManualChange = useCallback(
    (nextValue: FurnaceProgramValues) => {
      setAppliedTemplateLabel(null)
      onChange(nextValue)
    },
    [onChange],
  )

  const applyTemplate = (template: QuickTemplate) => {
    setAppliedTemplateLabel(template.label)
    onChange(payloadToFurnaceProgramValues(asRecord(template.payload)))
  }

  const handleZonesCountChange = useCallback(
    (newZonesCountStr: string) => {
      emitManualChange(syncFurnaceProgramZonesCount(value, newZonesCountStr))
    },
    [value, emitManualChange],
  )

  const updateFurnaceInfo = useCallback(
    (patch: Partial<typeof value.furnaceInfo>) => {
      emitManualChange({
        ...value,
        furnaceInfo: { ...value.furnaceInfo, ...patch },
      })
    },
    [value, emitManualChange],
  )

  const updateZone = useCallback(
    (zoneKey: string, patch: Partial<FurnaceZoneValues>) => {
      emitManualChange({
        ...value,
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey ? { ...zone, ...patch } : zone,
        ),
      })
    },
    [value, emitManualChange],
  )

  const updateSegment = useCallback(
    (
      zoneKey: string,
      segmentIndex: number,
      patch: Partial<FurnaceSegmentValues>,
    ) => {
      emitManualChange({
        ...value,
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey
            ? {
                ...zone,
                segments: zone.segments.map((seg, i) =>
                  i === segmentIndex ? { ...seg, ...patch } : seg,
                ),
              }
            : zone,
        ),
      })
    },
    [value, emitManualChange],
  )

  const addSegment = useCallback(
    (zoneKey: string) => {
      emitManualChange({
        ...value,
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey
            ? {
                ...zone,
                segments: [
                  ...zone.segments,
                  {
                    label: `区间 ${zone.segments.length + 1}`,
                    durationMin: '',
                    targetTemperatureC: '',
                    note: '',
                  },
                ],
              }
            : zone,
        ),
      })
    },
    [value, emitManualChange],
  )

  const removeSegment = useCallback(
    (zoneKey: string, segmentIndex: number) => {
      emitManualChange({
        ...value,
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey
            ? {
                ...zone,
                segments: zone.segments.filter((_, i) => i !== segmentIndex),
              }
            : zone,
        ),
      })
    },
    [value, emitManualChange],
  )

  const addPlacement = useCallback(() => {
    emitManualChange({
      ...value,
      placements: [...value.placements, createEmptyFurnacePlacement()],
    })
  }, [value, emitManualChange])

  const removePlacement = useCallback(
    (index: number) => {
      emitManualChange({
        ...value,
        placements: value.placements.filter((_, i) => i !== index),
      })
    },
    [value, emitManualChange],
  )

  const updatePlacement = useCallback(
    (index: number, patch: Partial<FurnacePlacementValues>) => {
      emitManualChange({
        ...value,
        placements: value.placements.map((placement, i) =>
          i === index ? { ...placement, ...patch } : placement,
        ),
      })
    },
    [value, emitManualChange],
  )

  return (
    <div className="flex flex-col gap-4">
      <div>
        <QuickTemplateMenu
          disabled={disabled}
          moduleKey="furnace_program"
          onSelect={applyTemplate}
          templates={templates}
        />
      </div>
      {appliedTemplateLabel ? (
        <Alert className="border-success/40 bg-success-soft [&>svg]:text-success">
          <CheckCircle2 />
          <AlertDescription className="text-foreground">
            已应用模板：{appliedTemplateLabel}，请确认或修改。
          </AlertDescription>
        </Alert>
      ) : null}

      <FurnaceProgramChart value={value} />

      <SubPanel title="炉子信息">
        <div className="editor-grid">
          <div className="editor-field">
            <Label htmlFor="furnace-zones-count">温区数量</Label>
            <Input
              id="furnace-zones-count"
              aria-label="温区数量"
              autoComplete="off"
              disabled={disabled}
              placeholder="例如 2"
              value={value.furnaceInfo.zonesCount}
              onChange={(e) => handleZonesCountChange(e.target.value)}
            />
          </div>
          <div className="editor-field">
            <Label htmlFor="furnace-model">炉子型号</Label>
            <Input
              id="furnace-model"
              aria-label="炉子型号"
              autoComplete="off"
              disabled={disabled}
              placeholder="可选"
              value={value.furnaceInfo.model}
              onChange={(e) => updateFurnaceInfo({ model: e.target.value })}
            />
          </div>
        </div>
      </SubPanel>

      {value.zones.map((zone, zoneIndex) => {
        const title = `温区 ${zoneIndex + 1}`
        return (
          <SubPanel
            key={zone.zoneKey || `zone-${zoneIndex}`}
            title={title}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => addSegment(zone.zoneKey)}
              >
                <Plus className="size-4" />
                添加区间
              </Button>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="editor-grid">
                <div className="editor-field">
                  <Label htmlFor={`${zone.zoneKey}-start-temp`}>起始温度</Label>
                  <Input
                    id={`${zone.zoneKey}-start-temp`}
                    aria-label={`${title} 起始温度`}
                    autoComplete="off"
                    disabled={disabled}
                    placeholder="°C"
                    value={zone.startTemperatureC}
                    onChange={(e) =>
                      updateZone(zone.zoneKey, {
                        startTemperatureC: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              {zone.segments.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  尚未添加区间
                </p>
              ) : (
                zone.segments.map((segment, segIndex) => (
                  <div
                    key={`${zone.zoneKey}-seg-${segIndex}`}
                    className="rounded-md border p-4"
                  >
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <span className="text-sm font-semibold">
                        {segment.label || `区间 ${segIndex + 1}`}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        onClick={() => removeSegment(zone.zoneKey, segIndex)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                        <span className="sr-only">删除</span>
                      </Button>
                    </div>
                    <div className="editor-grid">
                      <div className="editor-field">
                        <Label htmlFor={`${zone.zoneKey}-seg-${segIndex}-label`}>
                          标签
                        </Label>
                        <Input
                          id={`${zone.zoneKey}-seg-${segIndex}-label`}
                          aria-label={`${title} 区间${segIndex + 1} 标签`}
                          autoComplete="off"
                          disabled={disabled}
                          placeholder="例如 升温"
                          value={segment.label}
                          onChange={(e) =>
                            updateSegment(zone.zoneKey, segIndex, {
                              label: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="editor-field">
                        <Label
                          htmlFor={`${zone.zoneKey}-seg-${segIndex}-duration`}
                        >
                          时长
                        </Label>
                        <Input
                          id={`${zone.zoneKey}-seg-${segIndex}-duration`}
                          aria-label={`${title} 区间${segIndex + 1} 时长`}
                          autoComplete="off"
                          disabled={disabled}
                          placeholder="min"
                          value={segment.durationMin}
                          onChange={(e) =>
                            updateSegment(zone.zoneKey, segIndex, {
                              durationMin: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="editor-field">
                        <Label htmlFor={`${zone.zoneKey}-seg-${segIndex}-temp`}>
                          目标温度
                        </Label>
                        <Input
                          id={`${zone.zoneKey}-seg-${segIndex}-temp`}
                          aria-label={`${title} 区间${segIndex + 1} 目标温度`}
                          autoComplete="off"
                          disabled={disabled}
                          placeholder="°C"
                          value={segment.targetTemperatureC}
                          onChange={(e) =>
                            updateSegment(zone.zoneKey, segIndex, {
                              targetTemperatureC: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="editor-field editor-field-wide">
                        <Label htmlFor={`${zone.zoneKey}-seg-${segIndex}-note`}>
                          节点备注
                        </Label>
                        <Input
                          id={`${zone.zoneKey}-seg-${segIndex}-note`}
                          aria-label={`${title} 区间${segIndex + 1} 备注`}
                          autoComplete="off"
                          disabled={disabled}
                          value={segment.note}
                          onChange={(e) =>
                            updateSegment(zone.zoneKey, segIndex, {
                              note: e.target.value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}

              <div className="editor-field editor-field-wide">
                <Label htmlFor={`${zone.zoneKey}-note`}>温区备注</Label>
                <Input
                  id={`${zone.zoneKey}-note`}
                  aria-label={`${title} 备注`}
                  autoComplete="off"
                  disabled={disabled}
                  value={zone.note}
                  onChange={(e) =>
                    updateZone(zone.zoneKey, { note: e.target.value })
                  }
                />
              </div>
            </div>
          </SubPanel>
        )
      })}

      <SubPanel
        title="前驱体放置"
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={addPlacement}
          >
            <Plus className="size-4" />
            添加放置
          </Button>
        }
      >
        {value.placements.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            尚未添加前驱体放置
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {value.placements.map((placement, index) => (
              <div
                key={`placement-${index}`}
                className="rounded-md border p-4"
              >
                <div className="mb-3 flex items-center justify-between gap-4">
                  <span className="text-sm font-semibold">{`放置 ${index + 1}`}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => removePlacement(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">删除</span>
                  </Button>
                </div>
                <div className="editor-grid">
                  <div className="editor-field">
                    <Label>{`前驱体 ${index + 1}`}</Label>
                    <Select
                      disabled={disabled}
                      value={placement.precursorIndex || undefined}
                      onValueChange={(nextValue) =>
                        updatePlacement(index, { precursorIndex: nextValue })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`前驱体 ${index + 1}`}
                      >
                        <SelectValue placeholder="选择已有前驱体" />
                      </SelectTrigger>
                      <SelectContent>
                        {precursorOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="editor-field">
                    <Label>{`温区 ${index + 1}`}</Label>
                    <Select
                      disabled={disabled}
                      value={placement.zoneKey || undefined}
                      onValueChange={(nextValue) =>
                        updatePlacement(index, { zoneKey: nextValue })
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`温区 ${index + 1}`}
                      >
                        <SelectValue placeholder="选择温区" />
                      </SelectTrigger>
                      <SelectContent>
                        {zoneKeys.map((zoneKey) => (
                          <SelectItem key={zoneKey} value={zoneKey}>
                            {zoneKey}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="editor-field">
                    <Label htmlFor={`placement-${index}-position`}>
                      {`位置 ${index + 1}`}
                    </Label>
                    <Input
                      id={`placement-${index}-position`}
                      aria-label={`位置 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      placeholder="position_cm"
                      value={placement.positionCm}
                      onChange={(e) =>
                        updatePlacement(index, { positionCm: e.target.value })
                      }
                    />
                  </div>
                  <div className="editor-field editor-field-wide">
                    <Label htmlFor={`placement-${index}-note`}>
                      {`备注 ${index + 1}`}
                    </Label>
                    <Input
                      id={`placement-${index}-note`}
                      aria-label={`放置备注 ${index + 1}`}
                      autoComplete="off"
                      disabled={disabled}
                      value={placement.note}
                      onChange={(e) =>
                        updatePlacement(index, { note: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SubPanel>
    </div>
  )
}
