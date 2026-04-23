import { Button, Empty, Input, Typography } from "antd";

import {
  createEmptyGasSegment,
  type GasProgramValues,
} from "../editor-types";

export function GasProgramSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
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

  return (
    <div className="content-stack">
      <div className="editor-field">
        <Typography.Text strong>预清洗气体</Typography.Text>
        <Input
          aria-label="预清洗气体"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              preWashingGas: event.target.value,
            });
          }}
          placeholder="例如 Ar+H2"
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
              <Input
                aria-label={`气体 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateSegment(index, { gas: event.target.value });
                }}
                placeholder="例如 Ar"
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
