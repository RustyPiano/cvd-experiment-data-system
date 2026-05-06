import { Alert, Button, Card, Empty, Input, Switch, Typography } from "antd";
import { useCallback, useState } from "react";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_FURNACE_TEMPLATES, type QuickTemplate } from "../data/builtin-templates";
import {
  createEmptyFurnacePrecursor,
  createEmptyFurnaceStep,
  type FurnacePrecursorValues,
  type FurnaceProgramValues,
  type FurnaceStepValues,
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

function getZoneKeys(zonesCount: number): string[] {
  return Array.from({ length: zonesCount }, (_, i) => `zone_${i + 1}`);
}

function toFurnaceProgramValues(payload: Record<string, unknown>): FurnaceProgramValues {
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
    precursors: asObjectArray(payload.precursors).map((p) => ({
      sourcePayload: p,
      material: asString(p.material),
      positionCm: asString(p.position_cm),
      massMg: asString(p.mass_mg),
      note: asString(p.note),
    })),
    steps: asObjectArray(payload.steps).map((s) => {
      const temps = asRecord(s.temperatures_C);
      const temperaturesC: Record<string, string> = {};
      for (const zoneKey of getZoneKeys(validZonesCount)) {
        temperaturesC[zoneKey] = asString(temps[zoneKey]);
      }
      return {
        sourcePayload: s,
        stepName: asString(s.step_name),
        durationMin: asString(s.duration_min),
        isHold: asBoolean(s.is_hold),
        temperaturesC,
        note: asString(s.note),
      };
    }),
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

  const parsedZonesCount = parseInt(value.furnaceInfo.zonesCount, 10);
  const zonesCount = Number.isFinite(parsedZonesCount) && parsedZonesCount > 0 ? parsedZonesCount : 2;
  const zoneKeys = getZoneKeys(zonesCount);

  const emitManualChange = useCallback((nextValue: FurnaceProgramValues) => {
    setAppliedTemplateLabel(null);
    onChange(nextValue);
  }, [onChange]);

  const applyTemplate = (template: QuickTemplate) => {
    setAppliedTemplateLabel(template.label);
    onChange(toFurnaceProgramValues(asRecord(template.payload)));
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

      const newSteps = value.steps.map((step) => {
        const newTemperaturesC: Record<string, string> = {};
        for (const key of newZoneKeys) {
          newTemperaturesC[key] = step.temperaturesC[key] ?? "";
        }
        return { ...step, temperaturesC: newTemperaturesC };
      });

      emitManualChange({
        furnaceInfo: {
          ...value.furnaceInfo,
          zonesCount: newZonesCountStr,
          initialTemperaturesC: newInitialTemperaturesC,
        },
        precursors: value.precursors,
        steps: newSteps,
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

  const updateInitialTemperature = useCallback(
    (zoneKey: string, temperature: string) => {
      emitManualChange({
        ...value,
        furnaceInfo: {
          ...value.furnaceInfo,
          initialTemperaturesC: { ...value.furnaceInfo.initialTemperaturesC, [zoneKey]: temperature },
        },
      });
    },
    [value, emitManualChange],
  );

  const addPrecursor = useCallback(() => {
    emitManualChange({ ...value, precursors: [...value.precursors, createEmptyFurnacePrecursor()] });
  }, [value, emitManualChange]);

  const removePrecursor = useCallback(
    (index: number) => {
      emitManualChange({ ...value, precursors: value.precursors.filter((_, i) => i !== index) });
    },
    [value, emitManualChange],
  );

  const updatePrecursor = useCallback(
    (index: number, patch: Partial<FurnacePrecursorValues>) => {
      emitManualChange({
        ...value,
        precursors: value.precursors.map((p, i) => (i === index ? { ...p, ...patch } : p)),
      });
    },
    [value, emitManualChange],
  );

  const addStep = useCallback(() => {
    const newStep: FurnaceStepValues = {
      ...createEmptyFurnaceStep(),
      temperaturesC: Object.fromEntries(zoneKeys.map((key) => [key, ""])),
    };
    emitManualChange({ ...value, steps: [...value.steps, newStep] });
  }, [value, zoneKeys, emitManualChange]);

  const removeStep = useCallback(
    (index: number) => {
      emitManualChange({ ...value, steps: value.steps.filter((_, i) => i !== index) });
    },
    [value, emitManualChange],
  );

  const updateStep = useCallback(
    (index: number, patch: Partial<FurnaceStepValues>) => {
      emitManualChange({
        ...value,
        steps: value.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      });
    },
    [value, emitManualChange],
  );

  const updateStepTemperature = useCallback(
    (stepIndex: number, zoneKey: string, temperature: string) => {
      emitManualChange({
        ...value,
        steps: value.steps.map((s, i) =>
          i === stepIndex
            ? { ...s, temperaturesC: { ...s.temperaturesC, [zoneKey]: temperature } }
            : s,
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
        <div className="editor-form-grid" style={{ marginTop: 12 }}>
          {zoneKeys.map((zoneKey) => (
            <div className="editor-field" key={`init-temp-${zoneKey}`}>
              <Typography.Text strong>{`初始温度 ${zoneKey}`}</Typography.Text>
              <Input
                aria-label={`初始温度 ${zoneKey}`}
                disabled={disabled}
                onChange={(e) => updateInitialTemperature(zoneKey, e.target.value)}
                placeholder="°C"
                value={value.furnaceInfo.initialTemperaturesC[zoneKey] ?? ""}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card
        size="small"
        title="前驱体"
        extra={
          <Button disabled={disabled} onClick={addPrecursor} size="small">
            添加前驱体
          </Button>
        }
      >
        {value.precursors.length === 0 ? (
          <Empty description="尚未添加前驱体" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          value.precursors.map((precursor, index) => (
            <div className="editor-form-grid" key={`precursor-${index}`}>
              <div className="editor-field">
                <Typography.Text strong>{`材料 ${index + 1}`}</Typography.Text>
                <Input
                  aria-label={`材料 ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => updatePrecursor(index, { material: e.target.value })}
                  placeholder="材料名称"
                  value={precursor.material}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>{`位置 ${index + 1}`}</Typography.Text>
                <Input
                  aria-label={`位置 ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => updatePrecursor(index, { positionCm: e.target.value })}
                  placeholder="position_cm"
                  value={precursor.positionCm}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>{`质量 ${index + 1}`}</Typography.Text>
                <Input
                  aria-label={`质量 ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => updatePrecursor(index, { massMg: e.target.value })}
                  placeholder="mass_mg"
                  value={precursor.massMg}
                />
              </div>
              <div className="editor-field editor-field-wide">
                <Typography.Text strong>{`备注 ${index + 1}`}</Typography.Text>
                <Input
                  aria-label={`前驱体备注 ${index + 1}`}
                  disabled={disabled}
                  onChange={(e) => updatePrecursor(index, { note: e.target.value })}
                  value={precursor.note}
                />
              </div>
              <div className="editor-inline-actions">
                <Button
                  danger
                  disabled={disabled}
                  onClick={() => removePrecursor(index)}
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
        {value.steps.length === 0 ? (
          <Empty description="尚未添加步骤" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          value.steps.map((step, stepIndex) => (
            <Card
              key={`step-${stepIndex}`}
              size="small"
              title={`步骤 ${stepIndex + 1}`}
              extra={
                <Button
                  danger
                  disabled={disabled}
                  onClick={() => removeStep(stepIndex)}
                  size="small"
                  type="text"
                >
                  删除步骤
                </Button>
              }
            >
              <div className="editor-form-grid">
                <div className="editor-field">
                  <Typography.Text strong>步骤名称</Typography.Text>
                  <Input
                    aria-label={`步骤名称 ${stepIndex + 1}`}
                    disabled={disabled}
                    onChange={(e) => updateStep(stepIndex, { stepName: e.target.value })}
                    placeholder="例如 升温"
                    value={step.stepName}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>持续时间</Typography.Text>
                  <Input
                    aria-label={`持续时间 ${stepIndex + 1}`}
                    disabled={disabled}
                    onChange={(e) => updateStep(stepIndex, { durationMin: e.target.value })}
                    placeholder="duration_min"
                    value={step.durationMin}
                  />
                </div>
                <div className="editor-switch-row">
                  <Typography.Text strong>恒温保持</Typography.Text>
                  <Switch
                    aria-label={`恒温保持 ${stepIndex + 1}`}
                    checked={step.isHold}
                    disabled={disabled}
                    onChange={(checked) => updateStep(stepIndex, { isHold: checked })}
                  />
                </div>
              </div>
              <div className="editor-form-grid" style={{ marginTop: 12 }}>
                {zoneKeys.map((zoneKey) => (
                  <div className="editor-field" key={`step-${stepIndex + 1}-temp-${zoneKey}`}>
                    <Typography.Text strong>{`温度 ${zoneKey}`}</Typography.Text>
                    <Input
                      aria-label={`温度 ${zoneKey} 步骤${stepIndex + 1}`}
                      disabled={disabled}
                      onChange={(e) => updateStepTemperature(stepIndex, zoneKey, e.target.value)}
                      placeholder="°C"
                      value={step.temperaturesC[zoneKey] ?? ""}
                    />
                  </div>
                ))}
              </div>
              <div className="editor-field editor-field-wide" style={{ marginTop: 12 }}>
                <Typography.Text strong>步骤备注</Typography.Text>
                <Input
                  aria-label={`步骤备注 ${stepIndex + 1}`}
                  disabled={disabled}
                  onChange={(e) => updateStep(stepIndex, { note: e.target.value })}
                  value={step.note}
                />
              </div>
            </Card>
          ))
        )}
        <Button disabled={disabled} onClick={addStep}>
          添加步骤
        </Button>
      </div>
    </div>
  );
}