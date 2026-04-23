import { Button, Empty, Input, Typography } from "antd";

import {
  createEmptyObservationEvent,
  type ProcessObservationValues,
} from "../editor-types";

const { TextArea } = Input;

export function ProcessObservationSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: ProcessObservationValues) => void;
  value: ProcessObservationValues;
}) {
  const updateEvent = (index: number, nextValue: string) => {
    onChange({
      ...value,
      abnormalEvents: value.abnormalEvents.map((item, itemIndex) =>
        itemIndex === index ? nextValue : item,
      ),
    });
  };

  return (
    <div className="content-stack">
      <div className="editor-form-grid">
        <div className="editor-field editor-field-wide">
          <Typography.Text strong>颜色变化</Typography.Text>
          <Input
            aria-label="颜色变化"
            disabled={disabled}
            onChange={(event) => {
              onChange({
                ...value,
                colorChange: event.target.value,
              });
            }}
            placeholder="例如 center area darkened"
            value={value.colorChange}
          />
        </div>
        <div className="editor-field editor-field-wide">
          <Typography.Text strong>观察备注</Typography.Text>
          <TextArea
            aria-label="观察备注"
            autoSize={{ minRows: 3, maxRows: 5 }}
            disabled={disabled}
            onChange={(event) => {
              onChange({
                ...value,
                note: event.target.value,
              });
            }}
            placeholder="记录生长过程中的稳定性、沉积或异常情况"
            value={value.note}
          />
        </div>
      </div>

      {value.abnormalEvents.length === 0 ? (
        <Empty description="尚未添加异常事件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      {value.abnormalEvents.map((item, index) => (
        <div className="editor-array-card" key={`observation-event-${index + 1}`}>
          <div className="editor-array-card-header">
            <Typography.Text strong>{`异常事件 ${index + 1}`}</Typography.Text>
            <Button
              danger
              disabled={disabled}
              onClick={() => {
                onChange({
                  ...value,
                  abnormalEvents: value.abnormalEvents.filter((_, itemIndex) => itemIndex !== index),
                });
              }}
              size="small"
              type="text"
            >
              删除
            </Button>
          </div>
          <Input
            aria-label={`异常事件 ${index + 1}`}
            disabled={disabled}
            onChange={(event) => {
              updateEvent(index, event.target.value);
            }}
            placeholder="例如 minor condensate"
            value={item}
          />
        </div>
      ))}

      <Button
        disabled={disabled}
        onClick={() => {
          onChange({
            ...value,
            abnormalEvents: [...value.abnormalEvents, createEmptyObservationEvent()],
          });
        }}
      >
        添加异常事件
      </Button>
    </div>
  );
}
