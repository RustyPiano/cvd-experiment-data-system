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

  const resolveMethodFlags = (method: string) => {
    const normalizedMethod = method.trim().toLowerCase();
    return {
      showSolutionFields:
        normalizedMethod.includes("solution") || normalizedMethod.includes("spin"),
      showSpinFields: normalizedMethod.includes("spin"),
      showMeltingFields: normalizedMethod.includes("melt"),
    };
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
            <div className="editor-field">
              <Typography.Text strong>{`前驱体品牌 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`前驱体品牌 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { brand: event.target.value });
                }}
                placeholder="例如 Alfa"
                value={item.brand}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`制备方法 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`制备方法 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { method: event.target.value });
                }}
                placeholder="例如 spin_coating / solution_drop / melting"
                value={item.method}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`前驱体质量 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`前驱体质量 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { massMg: event.target.value });
                }}
                placeholder="mg"
                value={item.massMg}
              />
            </div>
            <div className="editor-field">
              <Typography.Text strong>{`前驱体批次 ${index + 1}`}</Typography.Text>
              <Input
                aria-label={`前驱体批次 ${index + 1}`}
                disabled={disabled}
                onChange={(event) => {
                  updateItem(index, { batchNo: event.target.value });
                }}
                placeholder="例如 MO-2026-01"
                value={item.batchNo}
              />
            </div>
            {resolveMethodFlags(item.method).showSolutionFields ? (
              <>
                <div className="editor-field">
                  <Typography.Text strong>{`浓度 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`浓度 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { concentration: event.target.value });
                    }}
                    placeholder="例如 0.5"
                    value={item.concentration}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>{`浓度单位 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`浓度单位 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { concentrationUnit: event.target.value });
                    }}
                    placeholder="例如 mol/L"
                    value={item.concentrationUnit}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>{`制备时长 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`制备时长 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { preparationTimeMin: event.target.value });
                    }}
                    placeholder="min"
                    value={item.preparationTimeMin}
                  />
                </div>
              </>
            ) : null}
            {resolveMethodFlags(item.method).showSpinFields ? (
              <>
                <div className="editor-field">
                  <Typography.Text strong>{`预旋涂转速 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`预旋涂转速 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { preSpinSpeedRpm: event.target.value });
                    }}
                    placeholder="rpm"
                    value={item.preSpinSpeedRpm}
                  />
                </div>
                <div className="editor-field">
                  <Typography.Text strong>{`旋涂转速 ${index + 1}`}</Typography.Text>
                  <Input
                    aria-label={`旋涂转速 ${index + 1}`}
                    disabled={disabled}
                    onChange={(event) => {
                      updateItem(index, { spinSpeedRpm: event.target.value });
                    }}
                    placeholder="rpm"
                    value={item.spinSpeedRpm}
                  />
                </div>
              </>
            ) : null}
            {resolveMethodFlags(item.method).showMeltingFields ? (
              <div className="editor-field">
                <Typography.Text strong>{`熔融温度 ${index + 1}`}</Typography.Text>
                <Input
                  aria-label={`熔融温度 ${index + 1}`}
                  disabled={disabled}
                  onChange={(event) => {
                    updateItem(index, { meltingTemperatureC: event.target.value });
                  }}
                  placeholder="°C"
                  value={item.meltingTemperatureC}
                />
              </div>
            ) : null}
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
