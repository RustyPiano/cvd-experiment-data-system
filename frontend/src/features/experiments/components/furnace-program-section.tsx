import { Alert, Button, Card, Empty, Input, Select, Typography } from "antd";
import { useCallback, useState } from "react";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_FURNACE_TEMPLATES, type QuickTemplate } from "../data/builtin-templates";
import {
  createEmptyFurnacePlacement,
  type FurnacePlacementValues,
  type FurnaceProgramValues,
  type FurnaceSegmentValues,
  type FurnaceZoneValues,
  payloadToFurnaceProgramValues,
  type PrecursorItemValues,
  syncFurnaceProgramZonesCount,
} from "../editor-types";
import { QuickTemplateMenu } from "./quick-template-menu";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function getZoneKeys(zonesCount: number): string[] {
  return Array.from({ length: zonesCount }, (_, i) => `zone_${i + 1}`);
}

function parsePositiveIntegerValue(value: string) {
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }

  const numericValue = Number(trimmed);
  return Number.isSafeInteger(numericValue) ? numericValue : null;
}

export function FurnaceProgramSection({
  disabled,
  materialSystem,
  onChange,
  precursorItems,
  recipeTemplates = [],
  templates = BUILTIN_FURNACE_TEMPLATES,
  value,
}: {
  disabled: boolean;
  materialSystem?: string;
  onChange: (nextValue: FurnaceProgramValues) => void;
  precursorItems: PrecursorItemValues[];
  recipeTemplates?: RecipeRead[];
  templates?: QuickTemplate[];
  value: FurnaceProgramValues;
}) {
  const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<string | null>(null);

  const parsedZonesCount = parsePositiveIntegerValue(value.furnaceInfo.zonesCount);
  const zonesCount = parsedZonesCount ?? 2;
  const zoneKeys = getZoneKeys(zonesCount);
  const precursorOptions = precursorItems.map((item, index) => ({
    label: item.species.trim() || `前驱体 ${index + 1}`,
    value: String(index),
  }));
  const zoneOptions = zoneKeys.map((zoneKey) => ({ label: zoneKey, value: zoneKey }));

  const emitManualChange = useCallback(
    (nextValue: FurnaceProgramValues) => {
      setAppliedTemplateLabel(null);
      onChange(nextValue);
    },
    [onChange],
  );

  const applyTemplate = (template: QuickTemplate) => {
    setAppliedTemplateLabel(template.label);
    onChange(payloadToFurnaceProgramValues(asRecord(template.payload)));
  };

  const handleZonesCountChange = useCallback(
    (newZonesCountStr: string) => {
      emitManualChange(syncFurnaceProgramZonesCount(value, newZonesCountStr));
    },
    [value, emitManualChange],
  );

  const updateFurnaceInfo = useCallback(
    (patch: Partial<typeof value.furnaceInfo>) => {
      emitManualChange({
        ...value,
        furnaceInfo: { ...value.furnaceInfo, ...patch },
      });
    },
    [value, emitManualChange],
  );

  const updateZone = useCallback(
    (zoneKey: string, patch: Partial<FurnaceZoneValues>) => {
      emitManualChange({
        ...value,
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey ? { ...zone, ...patch } : zone,
        ),
      });
    },
    [value, emitManualChange],
  );

  const updateSegment = useCallback(
    (zoneKey: string, segmentIndex: number, patch: Partial<FurnaceSegmentValues>) => {
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
      });
    },
    [value, emitManualChange],
  );

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
                  { label: `区间 ${zone.segments.length + 1}`, durationMin: "", targetTemperatureC: "", note: "" },
                ],
              }
            : zone,
        ),
      });
    },
    [value, emitManualChange],
  );

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
      });
    },
    [value, emitManualChange],
  );

  const addPlacement = useCallback(() => {
    emitManualChange({
      ...value,
      placements: [...value.placements, createEmptyFurnacePlacement()],
    });
  }, [value, emitManualChange]);

  const removePlacement = useCallback(
    (index: number) => {
      emitManualChange({
        ...value,
        placements: value.placements.filter((_, i) => i !== index),
      });
    },
    [value, emitManualChange],
  );

  const updatePlacement = useCallback(
    (index: number, patch: Partial<FurnacePlacementValues>) => {
      emitManualChange({
        ...value,
        placements: value.placements.map((placement, i) =>
          i === index ? { ...placement, ...patch } : placement,
        ),
      });
    },
    [value, emitManualChange],
  );

  return (
    <div className="content-stack">
      <div>
        <QuickTemplateMenu
          disabled={disabled}
          materialSystem={materialSystem}
          moduleKey="furnace_program"
          onSelect={applyTemplate}
          recipeTemplates={recipeTemplates}
          templates={templates}
        />
      </div>
      {appliedTemplateLabel ? (
        <Alert
          showIcon
          title={`已应用模板：${appliedTemplateLabel}，请确认或修改。`}
          type="success"
        />
      ) : null}

      <Card size="small" title="炉子信息">
        <div className="editor-form-grid">
          <div className="editor-field">
            <Typography.Text strong>温区数量</Typography.Text>
            <Input
              aria-label="温区数量"
              disabled={disabled}
              onChange={(e) => handleZonesCountChange(e.target.value)}
              placeholder="例如 2"
              value={value.furnaceInfo.zonesCount}
            />
          </div>
          <div className="editor-field">
            <Typography.Text strong>炉子型号</Typography.Text>
            <Input
              aria-label="炉子型号"
              disabled={disabled}
              onChange={(e) => updateFurnaceInfo({ model: e.target.value })}
              placeholder="可选"
              value={value.furnaceInfo.model}
            />
          </div>
        </div>
      </Card>

      {value.zones.map((zone, zoneIndex) => {
        const title = `温区 ${zoneIndex + 1}`;
        return (
          <Card
            key={zone.zoneKey || `zone-${zoneIndex}`}
            size="small"
            title={title}
            extra={
              <Button
                disabled={disabled}
                onClick={() => addSegment(zone.zoneKey)}
                size="small"
              >
                添加区间
              </Button>
            }
          >
            <div className="content-stack">
              <div className="editor-form-grid">
                <div className="editor-field">
                  <Typography.Text strong>起始温度</Typography.Text>
                  <Input
                    aria-label={`${title} 起始温度`}
                    disabled={disabled}
                    onChange={(e) => updateZone(zone.zoneKey, { startTemperatureC: e.target.value })}
                    placeholder="°C"
                    value={zone.startTemperatureC}
                  />
                </div>
              </div>

              {zone.segments.length === 0 ? (
                <Empty description="尚未添加区间" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                zone.segments.map((segment, segIndex) => (
                  <div className="editor-array-card" key={`${zone.zoneKey}-seg-${segIndex}`}>
                    <div className="editor-array-card-header">
                      <Typography.Text strong>{segment.label || `区间 ${segIndex + 1}`}</Typography.Text>
                    </div>
                    <div className="editor-form-grid">
                      <div className="editor-field">
                        <Typography.Text strong>标签</Typography.Text>
                        <Input
                          aria-label={`${title} 区间${segIndex + 1} 标签`}
                          disabled={disabled}
                          onChange={(e) => updateSegment(zone.zoneKey, segIndex, { label: e.target.value })}
                          placeholder="例如 升温"
                          value={segment.label}
                        />
                      </div>
                      <div className="editor-field">
                        <Typography.Text strong>时长</Typography.Text>
                        <Input
                          aria-label={`${title} 区间${segIndex + 1} 时长`}
                          disabled={disabled}
                          onChange={(e) => updateSegment(zone.zoneKey, segIndex, { durationMin: e.target.value })}
                          placeholder="min"
                          value={segment.durationMin}
                        />
                      </div>
                      <div className="editor-field">
                        <Typography.Text strong>目标温度</Typography.Text>
                        <Input
                          aria-label={`${title} 区间${segIndex + 1} 目标温度`}
                          disabled={disabled}
                          onChange={(e) => updateSegment(zone.zoneKey, segIndex, { targetTemperatureC: e.target.value })}
                          placeholder="°C"
                          value={segment.targetTemperatureC}
                        />
                      </div>
                      <div className="editor-field editor-field-wide">
                        <Typography.Text strong>节点备注</Typography.Text>
                        <Input
                          aria-label={`${title} 区间${segIndex + 1} 备注`}
                          disabled={disabled}
                          onChange={(e) => updateSegment(zone.zoneKey, segIndex, { note: e.target.value })}
                          value={segment.note}
                        />
                      </div>
                      <div className="editor-inline-actions">
                        <Button
                          danger
                          disabled={disabled}
                          onClick={() => removeSegment(zone.zoneKey, segIndex)}
                          size="small"
                          type="text"
                        >
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}

              <div className="editor-field editor-field-wide">
                <Typography.Text strong>温区备注</Typography.Text>
                <Input
                  aria-label={`${title} 备注`}
                  disabled={disabled}
                  onChange={(e) => updateZone(zone.zoneKey, { note: e.target.value })}
                  value={zone.note}
                />
              </div>
            </div>
          </Card>
        );
      })}

      <Card
        size="small"
        title="前驱体放置"
        extra={
          <Button disabled={disabled} onClick={addPlacement} size="small">
            添加放置
          </Button>
        }
      >
        {value.placements.length === 0 ? (
          <Empty description="尚未添加前驱体放置" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          value.placements.map((placement, index) => (
            <div className="editor-form-grid" key={`placement-${index}`}>
              <div className="editor-field">
                <Typography.Text strong>{`前驱体 ${index + 1}`}</Typography.Text>
                <Select
                  aria-label={`前驱体 ${index + 1}`}
                  disabled={disabled}
                  onChange={(nextValue) => updatePlacement(index, { precursorIndex: nextValue })}
                  options={precursorOptions}
                  placeholder="选择已有前驱体"
                  value={placement.precursorIndex || undefined}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>{`温区 ${index + 1}`}</Typography.Text>
                <Select
                  aria-label={`温区 ${index + 1}`}
                  disabled={disabled}
                  onChange={(nextValue) => updatePlacement(index, { zoneKey: nextValue })}
                  options={zoneOptions}
                  placeholder="选择温区"
                  value={placement.zoneKey || undefined}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>{`位置 ${index + 1}`}</Typography.Text>
                <Input
                  aria-label={`位置 ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => updatePlacement(index, { positionCm: e.target.value })}
                  placeholder="position_cm"
                  value={placement.positionCm}
                />
              </div>
              <div className="editor-field editor-field-wide">
                <Typography.Text strong>{`备注 ${index + 1}`}</Typography.Text>
                <Input
                  aria-label={`放置备注 ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => updatePlacement(index, { note: e.target.value })}
                  value={placement.note}
                />
              </div>
              <div className="editor-inline-actions">
                <Button
                  danger
                  disabled={disabled}
                  onClick={() => removePlacement(index)}
                  size="small"
                  type="text"
                >
                  删除
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
