import { Alert, Button, Card, Empty, Input, Select, Typography } from "antd";
import { useCallback, useState } from "react";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_FURNACE_TEMPLATES, type QuickTemplate } from "../data/builtin-templates";
import {
  createEmptyFurnacePlacement,
  createEmptyFurnaceTemperatureNode,
  createEmptyFurnaceZone,
  type FurnacePlacementValues,
  type FurnaceProgramValues,
  type FurnaceTemperatureNodeValues,
  type FurnaceZoneValues,
  type PrecursorItemValues,
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

  return {
    furnaceInfo: {
      zonesCount: asString(info.zones_count) || "2",
      model: asString(info.model),
      initialTemperaturesC,
    },
    placements: toPlacements(payload, precursorItems),
    zones: toZones(payload, info, validZonesCount),
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

  const parsedZonesCount = parseInt(value.furnaceInfo.zonesCount, 10);
  const zonesCount = Number.isFinite(parsedZonesCount) && parsedZonesCount > 0 ? parsedZonesCount : 2;
  const zoneKeys = getZoneKeys(zonesCount);
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
      const newCount = parseInt(newZonesCountStr, 10);
      if (!Number.isFinite(newCount) || newCount < 1) {
        emitManualChange({
          ...value,
          furnaceInfo: { ...value.furnaceInfo, zonesCount: newZonesCountStr },
        });
        return;
      }

      const newZoneKeys = getZoneKeys(newCount);
      const newInitialTemperaturesC: Record<string, string> = {};
      for (const key of newZoneKeys) {
        newInitialTemperaturesC[key] = value.furnaceInfo.initialTemperaturesC[key] ?? "25";
      }

      const newZoneKeySet = new Set(newZoneKeys);
      const newZones = newZoneKeys.map((zoneKey) => {
        const existingZone = value.zones.find((zone) => zone.zoneKey === zoneKey);
        return existingZone ?? createEmptyFurnaceZone(zoneKey);
      });
      const newPlacements = value.placements.map((placement) =>
        placement.zoneKey && !newZoneKeySet.has(placement.zoneKey)
          ? { ...placement, zoneKey: "" }
          : placement,
      );

      emitManualChange({
        furnaceInfo: {
          ...value.furnaceInfo,
          zonesCount: newZonesCountStr,
          initialTemperaturesC: newInitialTemperaturesC,
        },
        placements: newPlacements,
        zones: newZones,
      });
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

  const addPlacement = useCallback(() => {
    emitManualChange({ ...value, placements: [...value.placements, createEmptyFurnacePlacement()] });
  }, [value, emitManualChange]);

  const removePlacement = useCallback(
    (index: number) => {
      emitManualChange({ ...value, placements: value.placements.filter((_, i) => i !== index) });
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

  const addTemperatureNode = useCallback(
    (zoneKey: string) => {
      emitManualChange({
        ...value,
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
    [value, emitManualChange],
  );

  const removeTemperatureNode = useCallback(
    (zoneKey: string, nodeIndex: number) => {
      emitManualChange({
        ...value,
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
    [value, emitManualChange],
  );

  const updateTemperatureNode = useCallback(
    (zoneKey: string, nodeIndex: number, patch: Partial<FurnaceTemperatureNodeValues>) => {
      emitManualChange({
        ...value,
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
          message={`已应用模板：${appliedTemplateLabel}，请确认或修改。`}
          showIcon
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

      <div className="content-stack">
        {value.zones.length === 0 ? (
          <Empty description="尚未添加温区程序" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          value.zones.map((zone, zoneIndex) => (
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
          ))
        )}
      </div>
    </div>
  );
}
