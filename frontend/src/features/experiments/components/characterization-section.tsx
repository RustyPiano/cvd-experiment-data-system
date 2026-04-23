import { Button, Empty, Input, Typography } from "antd";

import {
  createEmptyCharacterizationMethod,
  type CharacterizationValues,
} from "../editor-types";

export function CharacterizationSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: CharacterizationValues) => void;
  value: CharacterizationValues;
}) {
  const updateItem = (index: number, patch: Partial<(typeof value.methods)[number]>) => {
    onChange({
      ...value,
      methods: value.methods.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="content-stack">
      {value.methods.length === 0 ? (
        <Empty description="尚未添加表征记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : null}
      {value.methods.map((item, index) => (
        <div className="editor-array-card" key={`characterization-${index + 1}`}>
          <div className="editor-array-card-header">
            <Typography.Text strong>{`表征记录 ${index + 1}`}</Typography.Text>
            <Button
              danger
              disabled={disabled}
              onClick={() => {
                onChange({
                  ...value,
                  methods: value.methods.filter((_, itemIndex) => itemIndex !== index),
                });
              }}
              size="small"
              type="text"
            >
              删除
            </Button>
          </div>
          <div className="editor-form-grid">
            <div className="editor-field">
              <Typography.Text strong>{`表征方法 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`表征方法 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { method: event.target.value });
                }}
                placeholder="例如 Raman"
                value={item.method}
              />
            </div>
            <div className="editor-field editor-field-wide">
              <Typography.Text strong>{`表征结果 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`表征结果 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { result: event.target.value });
                }}
                placeholder="例如 peak visible"
                value={item.result}
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
            methods: [...value.methods, createEmptyCharacterizationMethod()],
          });
        }}
      >
        添加表征记录
      </Button>
    </div>
  );
}
