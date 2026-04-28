import { Alert, Button, Empty, Input, Switch, Typography } from "antd";
import { useState } from "react";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_FURNACE_TEMPLATES, type QuickTemplate } from "../data/builtin-templates";
import {
  createEmptyFurnacePoint,
  createEmptyFurnaceZone,
  type FurnaceProgramValues,
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

function asBoolean(value: unknown) {
  return value === true;
}

function toFurnaceProgramValues(payload: Record<string, unknown>): FurnaceProgramValues {
  return {
    zones: asObjectArray(payload.zones).map((zone) => ({
      sourcePayload: zone,
      zoneIndex: asString(zone.zone_index),
      precursorPlaced: asBoolean(zone.precursor_placed),
      note: asString(zone.note),
      temperatureProgram: asObjectArray(zone.temperature_program).map((point) => ({
        sourcePayload: point,
        timeMin: asString(point.time_min),
        temperatureC: asString(point.temperature_C),
      })),
    })),
  };
}

export function FurnaceProgramSection({
  disabled,
  materialSystem,
  onChange,
  recipeTemplates = [],
  templates = BUILTIN_FURNACE_TEMPLATES,
  value,
}: {
  disabled: boolean;
  materialSystem?: string;
  onChange: (nextValue: FurnaceProgramValues) => void;
  recipeTemplates?: RecipeRead[];
  templates?: QuickTemplate[];
  value: FurnaceProgramValues;
}) {
  const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<string | null>(null);

  const emitManualChange = (nextValue: FurnaceProgramValues) => {
    setAppliedTemplateLabel(null);
    onChange(nextValue);
  };

  const applyTemplate = (template: QuickTemplate) => {
    setAppliedTemplateLabel(template.label);
    onChange(toFurnaceProgramValues(asRecord(template.payload)));
  };

  const updateZone = (index: number, patch: Partial<(typeof value.zones)[number]>) => {
    emitManualChange({
      ...value,
      zones: value.zones.map((zone, zoneIndex) =>
        zoneIndex === index ? { ...zone, ...patch } : zone,
      ),
    });
  };

  const updatePoint = (
    zoneIndex: number,
    pointIndex: number,
    patch: Partial<(typeof value.zones)[number]["temperatureProgram"][number]>,
  ) => {
    emitManualChange({
      ...value,
      zones: value.zones.map((zone, currentZoneIndex) =>
        currentZoneIndex === zoneIndex
          ? {
              ...zone,
              temperatureProgram: zone.temperatureProgram.map((point, currentPointIndex) =>
                currentPointIndex === pointIndex ? { ...point, ...patch } : point,
              ),
            }
          : zone,
      ),
    });
  };

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
      {value.zones.length === 0 ? <Empty description="尚未添加温区" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
      {value.zones.map((zone, zoneIndex) => (
        <div className="editor-array-card" key={`zone-${zoneIndex + 1}`}>
          <div className="editor-array-card-header">
            <Typography.Text strong>{`温区 ${zoneIndex + 1}`}</Typography.Text>
            <Button
              danger
              disabled={disabled}
              onClick={() => {
                emitManualChange({
                  ...value,
                  zones: value.zones.filter((_, currentZoneIndex) => currentZoneIndex !== zoneIndex),
                });
              }}
              size="small"
              type="text"
            >
              删除温区
            </Button>
          </div>
          <div className="editor-form-grid">
            <div className="editor-field">
              <Typography.Text strong>{`温区编号 ${zoneIndex + 1}`}</Typography.Text>
              <Input
                aria-label={`温区编号 ${zoneIndex + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateZone(zoneIndex, { zoneIndex: event.target.value });
                }}
                placeholder="例如 1"
                value={zone.zoneIndex}
              />
            </div>
            <div className="editor-switch-row">
              <Typography.Text strong>{`放置前驱体 ${zoneIndex + 1}`}</Typography.Text>
              <Switch
                aria-label={`放置前驱体 ${zoneIndex + 1}`}
                checked={zone.precursorPlaced}
                disabled={disabled}
                onChange={(checked) => {
                  updateZone(zoneIndex, { precursorPlaced: checked });
                }}
              />
            </div>
            <div className="editor-field editor-field-wide">
              <Typography.Text strong>{`温区备注 ${zoneIndex + 1}`}</Typography.Text>
              <Input
                aria-label={`温区备注 ${zoneIndex + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateZone(zoneIndex, { note: event.target.value });
                }}
                value={zone.note}
              />
            </div>
          </div>
          <div className="content-stack" style={{ marginTop: 16 }}>
            {zone.temperatureProgram.map((point, pointIndex) => (
              <div className="editor-form-grid" key={`zone-${zoneIndex + 1}-point-${pointIndex + 1}`}>
                <div className="editor-field">
                  <Typography.Text strong>{`时间点 ${zoneIndex + 1}-${pointIndex + 1}`}</Typography.Text>
                  <Input
                    aria-label={`时间点 ${zoneIndex + 1}-${pointIndex + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updatePoint(zoneIndex, pointIndex, { timeMin: event.target.value });
                    }}
                    placeholder="time_min"
                    value={point.timeMin}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>{`温度 ${zoneIndex + 1}-${pointIndex + 1}`}</Typography.Text>
                  <Input
                    aria-label={`温度 ${zoneIndex + 1}-${pointIndex + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updatePoint(zoneIndex, pointIndex, { temperatureC: event.target.value });
                    }}
                    placeholder="temperature_C"
                    value={point.temperatureC}
                  />
                </div>
                <div className="editor-inline-actions">
                  <Button
                    danger
                    disabled={disabled}
                    onClick={() => {
                      updateZone(zoneIndex, {
                        temperatureProgram: zone.temperatureProgram.filter(
                          (_, currentPointIndex) => currentPointIndex !== pointIndex,
                        ),
                      });
                    }}
                    size="small"
                    type="text"
                  >
                    删除点
                  </Button>
                </div>
              </div>
            ))}
            <Button
              disabled={disabled}
              onClick={() => {
                updateZone(zoneIndex, {
                  temperatureProgram: [...zone.temperatureProgram, createEmptyFurnacePoint()],
                });
              }}
            >
              添加温度点
            </Button>
          </div>
        </div>
      ))}
      <Button
        disabled={disabled}
        onClick={() => {
          emitManualChange({
            ...value,
            zones: [...value.zones, createEmptyFurnaceZone()],
          });
        }}
      >
        添加温区
      </Button>
    </div>
  );
}
