import { Alert, Button, Empty, Input, Typography } from "antd";
import { useState } from "react";

import type { RecipeRead } from "../../../shared/types/api";
import { BUILTIN_GAS_TEMPLATES, type QuickTemplate } from "../data/builtin-templates";
import {
  createEmptyGasComponent,
  createEmptyGasSegment,
  type GasProgramValues,
  inferComponentFlowSccm,
  type VocabularySelectOption,
} from "../editor-types";
import { QuickTemplateMenu } from "./quick-template-menu";
import { VocabularyCombobox } from "./vocabulary-combobox";

const { TextArea } = Input;

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

function toGasProgramValues(payload: Record<string, unknown>): GasProgramValues {
  return {
    preWashingGas: asString(payload.pre_washing_gas),
    segments: asObjectArray(payload.segments).map((segment) => ({
      sourcePayload: segment,
      stage: asString(segment.stage),
      gas: asString(segment.gas),
      startMin: asString(segment.start_min),
      endMin: asString(segment.end_min),
      flowSccm: asString(segment.flow_sccm),
      note: asString(segment.note),
      components: asObjectArray(segment.components).map((component) => ({
        sourcePayload: component,
        gas: asString(component.name) || asString(component.gas),
        flowSccm: asString(component.flow_sccm) || inferComponentFlowSccm(component, segment),
      })),
    })),
  };
}

function computeComponentPercent(flowSccm: string, totalFlow: number): string | null {
  const value = Number(flowSccm);
  if (!Number.isFinite(value) || value <= 0 || totalFlow <= 0) {
    return null;
  }
  return `${Math.round((value / totalFlow) * 10000) / 100}%`;
}

export function GasProgramSection({
  disabled,
  gasOptions,
  materialSystem,
  onChange,
  recipeTemplates = [],
  templates = BUILTIN_GAS_TEMPLATES,
  value,
}: {
  disabled: boolean;
  gasOptions: VocabularySelectOption[];
  materialSystem?: string;
  onChange: (nextValue: GasProgramValues) => void;
  recipeTemplates?: RecipeRead[];
  templates?: QuickTemplate[];
  value: GasProgramValues;
}) {
  const [appliedTemplateLabel, setAppliedTemplateLabel] = useState<string | null>(null);

  const emitManualChange = (nextValue: GasProgramValues) => {
    setAppliedTemplateLabel(null);
    onChange(nextValue);
  };

  const applyTemplate = (template: QuickTemplate) => {
    setAppliedTemplateLabel(template.label);
    onChange(toGasProgramValues(asRecord(template.payload)));
  };

  const getSegmentTotalFlow = (segment: (typeof value.segments)[number]) => {
    return segment.components.reduce((sum, c) => {
      const v = Number(c.flowSccm);
      return Number.isFinite(v) && v > 0 ? sum + v : sum;
    }, 0);
  };

  const updateSegment = (index: number, patch: Partial<(typeof value.segments)[number]>) => {
    emitManualChange({
      ...value,
      segments: value.segments.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, ...patch } : segment,
      ),
    });
  };

  const updateComponent = (
    segmentIndex: number,
    componentIndex: number,
    patch: Partial<(typeof value.segments)[number]["components"][number]>,
  ) => {
    emitManualChange({
      ...value,
      segments: value.segments.map((segment, currentSegmentIndex) =>
        currentSegmentIndex === segmentIndex
          ? {
              ...segment,
              components: segment.components.map((component, currentComponentIndex) =>
                currentComponentIndex === componentIndex ? { ...component, ...patch } : component,
              ),
            }
          : segment,
      ),
    });
  };

  return (
    <div className="content-stack">
      <div>
        <QuickTemplateMenu
          disabled={disabled}
          materialSystem={materialSystem}
          moduleKey="gas_program"
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
      <div className="editor-field">
        <Typography.Text strong>预清洗气体</Typography.Text>
        <VocabularyCombobox
          ariaLabel="预清洗气体"
          disabled={disabled}
          onChange={(nextValue) => {
            emitManualChange({
              ...value,
              preWashingGas: nextValue,
            });
          }}
          options={gasOptions}
          placeholder="选择或输入气体"
          value={value.preWashingGas}
        />
      </div>
      {value.segments.length === 0 ? <Empty description="尚未添加气体程序段" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
      {value.segments.map((segment, index) => (
        <div className="editor-array-card" key={`gas-segment-${index + 1}`}>
          <div className="editor-array-card-header">
            <Typography.Text strong>{`程序段 ${index + 1}`}</Typography.Text>
            <Button
              danger
              disabled={disabled}
              onClick={() => {
                emitManualChange({
                  ...value,
                  segments: value.segments.filter((_, segmentIndex) => segmentIndex !== index),
                });
              }}
              size="small"
              type="text"
            >
              删除程序段
            </Button>
          </div>
          <div className="editor-form-grid">
            <div className="editor-field">
              <Typography.Text strong>{`阶段 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`阶段 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateSegment(index, { stage: event.target.value });
                }}
                placeholder="例如 growth"
                value={segment.stage}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`气体 ${index + 1}`}</Typography.Text>
              <VocabularyCombobox
                ariaLabel={`气体 ${index + 1}`}
                disabled={disabled}
                onChange={(nextValue) => {
                  updateSegment(index, { gas: nextValue });
                }}
                options={gasOptions}
                placeholder="选择或输入气体"
                value={segment.gas}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`开始时间 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`开始时间 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateSegment(index, { startMin: event.target.value });
                }}
                placeholder="start_min"
                value={segment.startMin}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`结束时间 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`结束时间 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateSegment(index, { endMin: event.target.value });
                }}
                placeholder="end_min"
                value={segment.endMin}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`流量 ${index + 1}`}</Typography.Text>
              {(() => {
                const totalComponentFlow = getSegmentTotalFlow(segment);
                const isAutoFlow = totalComponentFlow > 0;
                return isAutoFlow ? (
                  <Input
                    aria-label={`流量 ${index + 1}`}
                    disabled
                    placeholder="由组分流量自动合计"
                    value={String(totalComponentFlow)}
                  />
                ) : (
                  <Input
                    aria-label={`流量 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateSegment(index, { flowSccm: event.target.value });
                    }}
                    placeholder="flow_sccm"
                    value={segment.flowSccm}
                  />
                );
              })()}
            </div>
            <div className="editor-field editor-field-wide">
              <Typography.Text strong>{`程序段备注 ${index + 1}`}</Typography.Text>
              <TextArea
                aria-label={`程序段备注 ${index + 1}`}
                autoSize={{ minRows: 2, maxRows: 4 }}
                disabled={disabled}
                onChange={(event) => {
                  updateSegment(index, { note: event.target.value });
                }}
                placeholder="记录该阶段的补充说明"
                value={segment.note}
              />
            </div>
            <div className="editor-field editor-field-wide">
              <Typography.Text strong>{`组分配置 ${index + 1}`}</Typography.Text>
              <div className="content-stack">
                {segment.components.map((component, componentIndex) => (
                  <div
                    className="editor-form-grid"
                    key={`gas-segment-${index + 1}-component-${componentIndex + 1}`}
                  >
                    <div className="editor-field">
                      <Typography.Text strong>{`组件气体 ${index + 1}-${componentIndex + 1}`}</Typography.Text>
                      <VocabularyCombobox
                        ariaLabel={`组件气体 ${index + 1}-${componentIndex + 1}`}
                        disabled={disabled}
                        onChange={(nextValue) => {
                          updateComponent(index, componentIndex, {
                            gas: nextValue,
                          });
                        }}
                        options={gasOptions}
                        placeholder="选择或输入气体"
                        value={component.gas}
                      />
                    </div>
                    <div className="editor-field">
                      <Typography.Text strong>{`组分流量 ${index + 1}-${componentIndex + 1}`}</Typography.Text>
                      <Input
                        aria-label={`组分流量 ${index + 1}-${componentIndex + 1}`}
                        disabled={disabled}
                        onChange={(event) => {
                          updateComponent(index, componentIndex, {
                            flowSccm: event.target.value,
                          });
                        }}
                        placeholder="sccm"
                        value={component.flowSccm}
                      />
                    </div>
                    <div className="editor-field">
                      <Typography.Text strong>{`占比 ${index + 1}-${componentIndex + 1}`}</Typography.Text>
                      <Input
                        aria-label={`占比 ${index + 1}-${componentIndex + 1}`}
                        disabled
                        placeholder="自动计算"
                        value={computeComponentPercent(component.flowSccm, getSegmentTotalFlow(segment)) ?? ""}
                      />
                    </div>
                    <div className="editor-inline-actions">
                      <Button
                        danger
                        disabled={disabled}
                        onClick={() => {
                          updateSegment(index, {
                            components: segment.components.filter(
                              (_, currentComponentIndex) =>
                                currentComponentIndex !== componentIndex,
                            ),
                          });
                        }}
                        type="text"
                      >
                        删除组分
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  disabled={disabled}
                  onClick={() => {
                    updateSegment(index, {
                      components: [...segment.components, createEmptyGasComponent()],
                    });
                  }}
                >
                  添加组分
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
      <Button
        disabled={disabled}
        onClick={() => {
          emitManualChange({
            ...value,
            segments: [...value.segments, createEmptyGasSegment()],
          });
        }}
      >
        添加气体程序段
      </Button>
    </div>
  );
}
