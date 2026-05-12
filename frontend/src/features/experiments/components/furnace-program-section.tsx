import { Alert, Button, Card, Empty, Input, Select, Typography } from "antd";
import { useCallback, useState } from "react";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_FURNACE_TEMPLATES, type QuickTemplate } from "../data/builtin-templates";
import {
  buildFurnaceZonesFromQuickProgram,
  createEmptyFurnacePlacement,
  createEmptyFurnaceTemperatureNode,
  createQuickProgramFromZones,
  type FurnacePlacementValues,
  type FurnaceProgramValues,
  type FurnaceQuickProgramValues,
  type FurnaceQuickZoneValues,
  type FurnaceTemperatureNodeValues,
  type FurnaceZoneValues,
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

function asObjectArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function getZoneKeys(zonesCount: number): string[] {
  return Array.from({ length: zonesCount }, (_, i) => `zone_${i + 1}`);
}

function findPrecursorIndexBySpecies(precursorItems: PrecursorItemValues[], species: unknown) {
  const speciesString = asString(species).trim();
  if (!speciesString) {
    return "";
  }

  const index = precursorItems.findIndex((item) => item.species.trim() === speciesString);
  return index >= 0 ? String(index) : "";
}

function toPlacements(
  payload: Record<string, unknown>,
  precursorItems: PrecursorItemValues[],
): FurnacePlacementValues[] {
  const placements = asObjectArray(payload.placements);
  if (placements.length > 0) {
    return placements.map((placement) => ({
      sourcePayload: placement,
      precursorIndex: asString(placement.precursor_index),
      zoneKey: asString(placement.zone_key),
      positionCm: asString(placement.position_cm),
      note: asString(placement.note),
    }));
  }

  return asObjectArray(payload.precursors).map((legacy) => ({
    sourcePayload: legacy,
    precursorIndex: findPrecursorIndexBySpecies(precursorItems, legacy.material),
    zoneKey: "",
    positionCm: asString(legacy.position_cm),
    note: asString(legacy.note),
  }));
}

function toFurnaceProgramValues(
  payload: Record<string, unknown>,
  precursorItems: PrecursorItemValues[],
): FurnaceProgramValues {
  const info = asRecord(payload.furnace_info);
  const initialTempsRaw = asRecord(info.initial_temperatures_C);
  const initialTemperaturesC: Record<string, string> = {};
  for (const [key, value] of Object.entries(initialTempsRaw)) {
    initialTemperaturesC[key] = asString(value);
  }

  const zonesCount = parseInt(asString(info.zones_count), 10);
  const validZonesCount = Number.isFinite(zonesCount) && zonesCount > 0 ? zonesCount : 2;
  for (const zoneKey of getZoneKeys(validZonesCount)) {
    if (!(zoneKey in initialTemperaturesC)) {
      initialTemperaturesC[zoneKey] = "25";
    }
  }

  const zones = toZones(payload, info, validZonesCount);
  return {
    furnaceInfo: {
      zonesCount: asString(info.zones_count) || "2",
      model: asString(info.model),
      initialTemperaturesC,
    },
    quickProgram: createQuickProgramFromZones(zones, getZoneKeys(validZonesCount)),
    placements: toPlacements(payload, precursorItems),
    zones,
  };
}

function toZones(
  payload: Record<string, unknown>,
  info: Record<string, unknown>,
  zonesCount: number,
): FurnaceZoneValues[] {
  const zones = asObjectArray(payload.zones);
  if (zones.length > 0) {
    return zones.map((zone, index) => ({
      sourcePayload: zone,
      zoneKey: asString(zone.zone_key) || `zone_${index + 1}`,
      note: asString(zone.note),
      temperatureProgram: asObjectArray(zone.temperature_program).map((node) => ({
        sourcePayload: node,
        timeMin: asString(node.time_min),
        temperatureC: asString(node.temperature_C),
        note: asString(node.note),
      })),
    }));
  }

  const initialTemps = asRecord(info.initial_temperatures_C);
  const steps = asObjectArray(payload.steps);
  return getZoneKeys(zonesCount).map((zoneKey) => {
    let elapsedMin = 0;
    const temperatureProgram: FurnaceTemperatureNodeValues[] = [];
    const initialTemperature = asString(initialTemps[zoneKey]);
    if (initialTemperature) {
      temperatureProgram.push({ timeMin: "0", temperatureC: initialTemperature, note: "" });
    }
    for (const step of steps) {
      const duration = Number(asString(step.duration_min));
      if (Number.isFinite(duration)) {
        elapsedMin += duration;
      }
      const temps = asRecord(step.temperatures_C);
      if (!(zoneKey in temps)) {
        continue;
      }
      temperatureProgram.push({
        timeMin: String(elapsedMin),
        temperatureC: asString(temps[zoneKey]),
        note: asString(step.note),
      });
    }
    return { zoneKey, temperatureProgram, note: "" };
  });
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
  const [showAdvancedNodes, setShowAdvancedNodes] = useState(false);

  const parsedZonesCount = parseInt(value.furnaceInfo.zonesCount, 10);
  const zonesCount = Number.isFinite(parsedZonesCount) && parsedZonesCount > 0 ? parsedZonesCount : 2;
  const zoneKeys = getZoneKeys(zonesCount);
  const quickProgram = value.quickProgram ?? createQuickProgramFromZones(value.zones, zoneKeys);
  const precursorOptions = precursorItems.map((item, index) => ({
    label: item.species.trim() || `前驱体 ${index + 1}`,
    value: String(index),
  }));
  const zoneOptions = zoneKeys.map((zoneKey) => ({ label: zoneKey, value: zoneKey }));

  const emitManualChange = useCallback((nextValue: FurnaceProgramValues) => {
    setAppliedTemplateLabel(null);
    onChange(nextValue);
  }, [onChange]);

  const applyTemplate = (template: QuickTemplate) => {
    setAppliedTemplateLabel(template.label);
    onChange(toFurnaceProgramValues(asRecord(template.payload), precursorItems));
  };

  const handleZonesCountChange = useCallback(
    (newZonesCountStr: string) => {
      emitManualChange(syncFurnaceProgramZonesCount({ ...value, quickProgram }, newZonesCountStr));
    },
    [value, quickProgram, emitManualChange],
  );

  const updateFurnaceInfo = useCallback(
    (patch: Partial<typeof value.furnaceInfo>) => {
      emitManualChange({
        ...value,
        quickProgram,
        furnaceInfo: { ...value.furnaceInfo, ...patch },
      });
    },
    [value, quickProgram, emitManualChange],
  );

  const emitQuickProgramChange = useCallback(
    (nextQuickProgramInput: FurnaceQuickProgramValues) => {
      const nextQuickProgram = {
        ...nextQuickProgramInput,
        isCustom: false,
      };
      const nextZones = buildFurnaceZonesFromQuickProgram(zoneKeys, nextQuickProgram, value.zones);

      emitManualChange({
        ...value,
        furnaceInfo: {
          ...value.furnaceInfo,
          initialTemperaturesC: Object.fromEntries(
            zoneKeys.map((zoneKey) => [
              zoneKey,
              nextQuickProgram.zones[zoneKey]?.startTemperatureC ?? "25",
            ]),
          ),
        },
        quickProgram: nextQuickProgram,
        zones: nextZones,
      });
    },
    [value, zoneKeys, emitManualChange],
  );

  const updateQuickZone = useCallback(
    (zoneKey: string, patch: Partial<FurnaceQuickZoneValues>) => {
      const currentZone = quickProgram.zones[zoneKey] ?? {
        startTemperatureC: "25",
        segments: [],
      };
      emitQuickProgramChange({
        ...quickProgram,
        zones: {
          ...quickProgram.zones,
          [zoneKey]: {
            ...currentZone,
            ...patch,
            segments: patch.segments ?? currentZone.segments,
          },
        },
      });
    },
    [quickProgram, emitQuickProgramChange],
  );

  const updateQuickSegment = useCallback(
    (
      zoneKey: string,
      segmentIndex: number,
      patch: Partial<FurnaceQuickZoneValues["segments"][number]>,
    ) => {
      const currentZone = quickProgram.zones[zoneKey];
      if (!currentZone) {
        return;
      }
      updateQuickZone(zoneKey, {
        segments: currentZone.segments.map((segment, index) =>
          index === segmentIndex ? { ...segment, ...patch } : segment,
        ),
      });
    },
    [quickProgram.zones, updateQuickZone],
  );

  const addPlacement = useCallback(() => {
    emitManualChange({
      ...value,
      quickProgram,
      placements: [...value.placements, createEmptyFurnacePlacement()],
    });
  }, [value, quickProgram, emitManualChange]);

  const removePlacement = useCallback(
    (index: number) => {
      emitManualChange({
        ...value,
        quickProgram,
        placements: value.placements.filter((_, i) => i !== index),
      });
    },
    [value, quickProgram, emitManualChange],
  );

  const updatePlacement = useCallback(
    (index: number, patch: Partial<FurnacePlacementValues>) => {
      emitManualChange({
        ...value,
        quickProgram,
        placements: value.placements.map((placement, i) =>
          i === index ? { ...placement, ...patch } : placement,
        ),
      });
    },
    [value, quickProgram, emitManualChange],
  );

  const updateZone = useCallback(
    (zoneKey: string, patch: Partial<FurnaceZoneValues>) => {
      emitManualChange({
        ...value,
        quickProgram,
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey ? { ...zone, ...patch } : zone,
        ),
      });
    },
    [value, quickProgram, emitManualChange],
  );

  const markQuickProgramCustom = useCallback(() => ({ ...quickProgram, isCustom: true }), [quickProgram]);

  const addTemperatureNode = useCallback(
    (zoneKey: string) => {
      emitManualChange({
        ...value,
        quickProgram: markQuickProgramCustom(),
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey
            ? {
                ...zone,
                temperatureProgram: [
                  ...zone.temperatureProgram,
                  createEmptyFurnaceTemperatureNode(),
                ],
              }
            : zone,
        ),
      });
    },
    [value, markQuickProgramCustom, emitManualChange],
  );

  const removeTemperatureNode = useCallback(
    (zoneKey: string, nodeIndex: number) => {
      emitManualChange({
        ...value,
        quickProgram: markQuickProgramCustom(),
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey
            ? {
                ...zone,
                temperatureProgram: zone.temperatureProgram.filter((_, i) => i !== nodeIndex),
              }
            : zone,
        ),
      });
    },
    [value, markQuickProgramCustom, emitManualChange],
  );

  const updateTemperatureNode = useCallback(
    (zoneKey: string, nodeIndex: number, patch: Partial<FurnaceTemperatureNodeValues>) => {
      emitManualChange({
        ...value,
        quickProgram: markQuickProgramCustom(),
        zones: value.zones.map((zone) =>
          zone.zoneKey === zoneKey
            ? {
                ...zone,
                temperatureProgram: zone.temperatureProgram.map((node, i) =>
                  i === nodeIndex ? { ...node, ...patch } : node,
                ),
              }
            : zone,
        ),
      });
    },
    [value, markQuickProgramCustom, emitManualChange],
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

      <Card size="small" title="炉温快填">
        <div className="content-stack">
          {zoneKeys.map((zoneKey, zoneIndex) => {
            const title = `温区 ${zoneIndex + 1}`;
            const quickZone = quickProgram.zones[zoneKey] ?? {
              startTemperatureC: "25",
              segments: [],
            };

            return (
              <div className="editor-array-card" key={`quick-${zoneKey}`}>
                <div className="editor-array-card-header">
                  <Typography.Text strong>{`${title} 快填`}</Typography.Text>
                </div>
                <div className="editor-form-grid">
                  <div className="editor-field">
                    <Typography.Text strong>起始温度</Typography.Text>
                    <Input
                      aria-label={`${title} 起始温度`}
                      disabled={disabled}
                      onChange={(e) =>
                        updateQuickZone(zoneKey, { startTemperatureC: e.target.value })
                      }
                      placeholder="°C"
                      value={quickZone.startTemperatureC}
                    />
                  </div>
                  {quickZone.segments.map((segment, segmentIndex) => (
                    <div className="editor-form-grid editor-field-wide" key={segment.segmentKey}>
                      <div className="editor-field">
                        <Typography.Text strong>{`${segment.label}时长`}</Typography.Text>
                        <Input
                          aria-label={`${title} ${segment.label}时长`}
                          disabled={disabled}
                          onChange={(e) =>
                            updateQuickSegment(zoneKey, segmentIndex, {
                              durationMin: e.target.value,
                            })
                          }
                          placeholder="min"
                          value={segment.durationMin}
                        />
                      </div>
                      <div className="editor-field">
                        <Typography.Text strong>{`${segment.label}目标温度`}</Typography.Text>
                        <Input
                          aria-label={`${title} ${segment.label}目标温度`}
                          disabled={disabled}
                          onChange={(e) =>
                            updateQuickSegment(zoneKey, segmentIndex, {
                              targetTemperatureC: e.target.value,
                            })
                          }
                          placeholder="°C"
                          value={segment.targetTemperatureC}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {quickProgram.isCustom ? (
          <Alert
            showIcon
            style={{ marginTop: 16 }}
            title="当前节点已手动调整；再次修改快填字段会按快填参数重建节点。"
            type="info"
          />
        ) : null}
      </Card>

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

      <Card
        size="small"
        title="高级节点编辑"
        extra={
          <Button disabled={disabled} onClick={() => setShowAdvancedNodes((visible) => !visible)} size="small">
            高级节点编辑
          </Button>
        }
      >
        {showAdvancedNodes ? (
          <div className="content-stack">
            {value.zones.length === 0 ? (
              <Empty description="尚未添加温区程序" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : null}
            {value.zones.map((zone, zoneIndex) => (
            <Card
              key={zone.zoneKey || `zone-${zoneIndex}`}
              size="small"
              title={`温区 ${zoneIndex + 1} 温度变化`}
              extra={
                <Button
                  disabled={disabled}
                  onClick={() => addTemperatureNode(zone.zoneKey)}
                  size="small"
                >
                  {`添加温区 ${zoneIndex + 1} 节点`}
                </Button>
              }
            >
              {zone.temperatureProgram.length === 0 ? (
                <Empty description="尚未添加温度节点" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <div className="content-stack">
                  {zone.temperatureProgram.map((node, nodeIndex) => (
                    <div className="editor-form-grid" key={`${zone.zoneKey}-node-${nodeIndex}`}>
                      <div className="editor-field">
                        <Typography.Text strong>{`节点 ${nodeIndex + 1} 时间`}</Typography.Text>
                        <Input
                          aria-label={`温区 ${zoneIndex + 1} 节点 ${nodeIndex + 1} 时间`}
                          disabled={disabled}
                          onChange={(e) =>
                            updateTemperatureNode(zone.zoneKey, nodeIndex, {
                              timeMin: e.target.value,
                            })
                          }
                          placeholder="min"
                          value={node.timeMin}
                        />
                      </div>
                      <div className="editor-field">
                        <Typography.Text strong>{`节点 ${nodeIndex + 1} 温度`}</Typography.Text>
                        <Input
                          aria-label={`温区 ${zoneIndex + 1} 节点 ${nodeIndex + 1} 温度`}
                          disabled={disabled}
                          onChange={(e) =>
                            updateTemperatureNode(zone.zoneKey, nodeIndex, {
                              temperatureC: e.target.value,
                            })
                          }
                          placeholder="°C"
                          value={node.temperatureC}
                        />
                      </div>
                      <div className="editor-field editor-field-wide">
                        <Typography.Text strong>{`节点 ${nodeIndex + 1} 说明`}</Typography.Text>
                        <Input
                          aria-label={`温区 ${zoneIndex + 1} 节点 ${nodeIndex + 1} 说明`}
                          disabled={disabled}
                          onChange={(e) =>
                            updateTemperatureNode(zone.zoneKey, nodeIndex, {
                              note: e.target.value,
                            })
                          }
                          value={node.note}
                        />
                      </div>
                      <div className="editor-inline-actions">
                        <Button
                          danger
                          disabled={disabled}
                          onClick={() => removeTemperatureNode(zone.zoneKey, nodeIndex)}
                          size="small"
                          type="text"
                        >
                          删除节点
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="editor-field editor-field-wide" style={{ marginTop: 12 }}>
                <Typography.Text strong>温区备注</Typography.Text>
                <Input
                  aria-label={`温区 ${zoneIndex + 1} 备注`}
                  disabled={disabled}
                  onChange={(e) => updateZone(zone.zoneKey, { note: e.target.value })}
                  value={zone.note}
                />
              </div>
            </Card>
            ))}
          </div>
        ) : (
          <Typography.Text type="secondary">
            如需记录非标准曲线，可展开后逐节点调整。
          </Typography.Text>
        )}
      </Card>
    </div>
  );
}
