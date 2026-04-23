import { Button, Empty, Input, Space, Typography } from "antd";

import {
  createEmptyPrecursorItem,
  type PrecursorsValues,
} from "../editor-types";

export function PrecursorsSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: PrecursorsValues) => void;
  value: PrecursorsValues;
}) {
  const updateItem = (index: number, patch: Partial<(typeof value.items)[number]>) => {
    onChange({
      ...value,
      items: value.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  return (
    <div className="content-stack">
      {value.items.length === 0 ? <Empty description="尚未添加前驱体" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
      {value.items.map((item, index) => (
        <div className="editor-array-card" key={`precursor-${index + 1}`}>
          <div className="editor-array-card-header">
            <Typography.Text strong>{`前驱体 ${index + 1}`}</Typography.Text>
            <Button
              danger
              disabled={disabled}
              onClick={() => {
                onChange({
                  ...value,
                  items: value.items.filter((_, itemIndex) => itemIndex !== index),
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
              <Typography.Text strong>{`前驱体角色 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`前驱体角色 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { role: event.target.value });
                }}
                placeholder="例如 A"
                value={item.role}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`前驱体类型 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`前驱体类型 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { type: event.target.value });
                }}
                placeholder="例如 MoO3"
                value={item.type}
              />
            </div>
          </div>
        </div>
      ))}
      <Space>
        <Button
          disabled={disabled}
          onClick={() => {
            onChange({
              ...value,
              items: [...value.items, createEmptyPrecursorItem()],
            });
          }}
        >
          添加前驱体
        </Button>
      </Space>
    </div>
  );
}
