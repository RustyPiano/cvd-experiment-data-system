import { Button, Empty, Input, Select, Typography } from "antd";

import {
  createEmptySubstrateItem,
  type SubstratesValues,
} from "../editor-types";

const roleOptions = [
  { label: "top", value: "top" },
  { label: "bottom", value: "bottom" },
];

export function SubstratesSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: SubstratesValues) => void;
  value: SubstratesValues;
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
      {value.items.length === 0 ? <Empty description="尚未添加基底" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : null}
      {value.items.map((item, index) => (
        <div className="editor-array-card" key={`substrate-${index + 1}`}>
          <div className="editor-array-card-header">
            <Typography.Text strong>{`基底 ${index + 1}`}</Typography.Text>
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
              <Typography.Text strong>{`基底角色 ${index + 1}`}</Typography.Text>
              <Select
                aria-label={`基底角色 ${index + 1}`}
                disabled={disabled}
                onChange={(nextValue) => {
                  updateItem(index, { role: nextValue });
                }}
                options={roleOptions}
                placeholder="选择 top / bottom"
                value={item.role || undefined}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`基底类型 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`基底类型 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { type: event.target.value });
                }}
                placeholder="例如 SiO2/Si"
                value={item.type}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`品牌 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`品牌 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { brand: event.target.value });
                }}
                value={item.brand}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`尺寸 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`尺寸 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { sizeMm: event.target.value });
                }}
                placeholder="例如 5x10"
                value={item.sizeMm}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`处理方式 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`处理方式 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { treatmentMethod: event.target.value });
                }}
                placeholder="例如 plasma_cleaning"
                value={item.treatmentMethod}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`位置 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`位置 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { positionMm: event.target.value });
                }}
                placeholder="例如 1 或 -1"
                value={item.positionMm}
              />
            </div>
            {item.treatmentMethod.trim().length > 0 ? (
              <>
                <div className="editor-field">
                  <Typography.Text strong>{`处理参数温度 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`处理参数温度 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { treatmentTemperatureC: event.target.value });
                    }}
                    placeholder="°C"
                    value={item.treatmentTemperatureC}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>{`处理参数时长 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`处理参数时长 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { treatmentDurationMin: event.target.value });
                    }}
                    placeholder="min"
                    value={item.treatmentDurationMin}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>{`处理参数功率 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`处理参数功率 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { treatmentPowerW: event.target.value });
                    }}
                    placeholder="W"
                    value={item.treatmentPowerW}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>{`处理参数气体 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`处理参数气体 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { treatmentGas: event.target.value });
                    }}
                    placeholder="例如 Ar"
                    value={item.treatmentGas}
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>
      ))}
      <Button
        disabled={disabled}
        onClick={() => {
          onChange({
            ...value,
            items: [...value.items, createEmptySubstrateItem()],
          });
        }}
      >
        添加基底
      </Button>
    </div>
  );
}
