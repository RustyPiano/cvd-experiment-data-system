import { Button, Empty, Input, Typography } from "antd";

import {
  createEmptyGasComponent,
  createEmptyGasSegment,
  type GasProgramValues,
  type VocabularySelectOption,
} from "../editor-types";
import { VocabularyCombobox } from "./vocabulary-combobox";

const { TextArea } = Input;

export function GasProgramSection({
  disabled,
  gasOptions,
  onChange,
  value,
}: {
  disabled: boolean;
  gasOptions: VocabularySelectOption[];
  onChange: (nextValue: GasProgramValues) => void;
  value: GasProgramValues;
}) {
  const updateSegment = (index: number, patch: Partial<(typeof value.segments)[number]>) => {
    onChange({
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
    onChange({
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
      <div className="editor-field">
        <Typography.Text strong>预清洗气体</Typography.Text>
        <VocabularyCombobox
          ariaLabel="预清洗气体"
          disabled={disabled}
          onChange={(nextValue) => {
            onChange({
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
                onChange({
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
              <Input
                aria-label={`流量 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateSegment(index, { flowSccm: event.target.value });
                }}
                placeholder="flow_sccm"
                value={segment.flowSccm}
              />
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
                      <Typography.Text strong>{`组分比例 ${index + 1}-${componentIndex + 1}`}</Typography.Text>
                      <Input
                        aria-label={`组分比例 ${index + 1}-${componentIndex + 1}`}
                        disabled={disabled}
                        onChange={(event) => {
                          updateComponent(index, componentIndex, {
                            ratioPercent: event.target.value,
                          });
                        }}
                        placeholder="%"
                        value={component.ratioPercent}
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
          onChange({
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
