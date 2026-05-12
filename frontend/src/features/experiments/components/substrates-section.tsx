import { Button, Input, Select, Typography } from "antd";

import {
  createEmptySubstrateItem,
  type SubstrateItemValues,
  type SubstratesValues,
  type VocabularySelectOption,
} from "../editor-types";
import { VocabularyCombobox } from "./vocabulary-combobox";

const substrateRoles = [
  { role: "top", title: "上基底" },
  { role: "bottom", title: "下基底" },
];
const substrateRoleSet = new Set(substrateRoles.map((item) => item.role));
const positionOptions = [
  { label: "无", value: "" },
  { label: "-2", value: "-2" },
  { label: "-1", value: "-1" },
  { label: "0", value: "0" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
];

function createEmptySubstrateItemForRole(role: string): SubstrateItemValues {
  return {
    ...createEmptySubstrateItem(),
    role,
  };
}

function hasSourcePayload(item: SubstrateItemValues) {
  return Boolean(item.sourcePayload && Object.keys(item.sourcePayload).length > 0);
}

function hasSubstrateFieldValue(item: SubstrateItemValues) {
  return [
    item.type,
    item.brand,
    item.sizeMm,
    item.batchNo,
    item.treatmentMethod,
    item.positionMm,
    item.treatmentTemperatureC,
    item.treatmentDurationMin,
    item.treatmentPowerW,
    item.treatmentGas,
  ].some((value) => value.trim().length > 0);
}

function withLegacyPositionOption(currentValue: string) {
  if (!currentValue || positionOptions.some((option) => option.value === currentValue)) {
    return positionOptions;
  }

  return [{ label: currentValue, value: currentValue }, ...positionOptions];
}

export function SubstratesSection({
  disabled,
  gasOptions,
  onChange,
  substrateBrandOptions,
  substrateSizeOptions,
  substrateTreatmentMethodOptions,
  substrateTypeOptions,
  value,
}: {
  disabled: boolean;
  gasOptions: VocabularySelectOption[];
  onChange: (nextValue: SubstratesValues) => void;
  substrateBrandOptions: VocabularySelectOption[];
  substrateSizeOptions: VocabularySelectOption[];
  substrateTreatmentMethodOptions: VocabularySelectOption[];
  substrateTypeOptions: VocabularySelectOption[];
  value: SubstratesValues;
}) {
  const updateRoleItem = (role: string, patch: Partial<SubstrateItemValues>) => {
    const existing = value.items.find((item) => item.role === role);
    const nextItem = {
      ...(existing ?? createEmptySubstrateItemForRole(role)),
      ...patch,
      role,
    };
    const nextItems = substrateRoles
      .map((roleConfig) =>
        roleConfig.role === role
          ? nextItem
          : value.items.find((item) => item.role === roleConfig.role),
      )
      .filter((item): item is SubstrateItemValues =>
        Boolean(item && (hasSourcePayload(item) || hasSubstrateFieldValue(item))),
      );

    onChange({
      ...value,
      items: nextItems,
    });
  };

  const clearRoleItem = (role: string) => {
    onChange({
      ...value,
      items: value.items.filter((item) => item.role !== role && substrateRoleSet.has(item.role)),
    });
  };

  return (
    <div className="content-stack">
      {substrateRoles.map((roleConfig) => {
        const item =
          value.items.find((substrate) => substrate.role === roleConfig.role) ??
          createEmptySubstrateItemForRole(roleConfig.role);
        const showTreatmentParams =
          item.treatmentMethod.trim().length > 0 && item.treatmentMethod !== "none";

        return (
          <div className="editor-array-card" key={roleConfig.role}>
            <div className="editor-array-card-header">
              <Typography.Text strong>{roleConfig.title}</Typography.Text>
              <Button
                danger
                disabled={
                  disabled || !value.items.some((substrate) => substrate.role === roleConfig.role)
                }
                onClick={() => {
                  clearRoleItem(roleConfig.role);
                }}
                size="small"
                type="text"
              >
                {`清空${roleConfig.title}`}
              </Button>
            </div>
            <div className="editor-form-grid">
              <div className="editor-field">
                <Typography.Text strong>基底类型</Typography.Text>
                <VocabularyCombobox
                  ariaLabel={`基底类型 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) => {
                    updateRoleItem(roleConfig.role, { type: nextValue });
                  }}
                  options={substrateTypeOptions}
                  placeholder="选择或输入基底类型"
                  value={item.type}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>品牌</Typography.Text>
                <VocabularyCombobox
                  ariaLabel={`品牌 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) => {
                    updateRoleItem(roleConfig.role, { brand: nextValue });
                  }}
                  options={substrateBrandOptions}
                  placeholder="选择或输入品牌"
                  value={item.brand}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>尺寸</Typography.Text>
                <VocabularyCombobox
                  ariaLabel={`尺寸 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) => {
                    updateRoleItem(roleConfig.role, { sizeMm: nextValue });
                  }}
                  options={substrateSizeOptions}
                  placeholder="选择或输入尺寸"
                  value={item.sizeMm}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>基底批次</Typography.Text>
                <Input
                  aria-label={`基底批次 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(event) => {
                    updateRoleItem(roleConfig.role, { batchNo: event.target.value });
                  }}
                  placeholder="填写基底批次"
                  value={item.batchNo}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>处理方式</Typography.Text>
                <VocabularyCombobox
                  ariaLabel={`处理方式 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) => {
                    updateRoleItem(roleConfig.role, { treatmentMethod: nextValue });
                  }}
                  options={substrateTreatmentMethodOptions}
                  placeholder="选择或输入处理方式"
                  value={item.treatmentMethod}
                />
              </div>
              <div className="editor-field">
                <Typography.Text strong>相对温区位置</Typography.Text>
                <Select
                  aria-label={`相对温区位置 ${roleConfig.title}`}
                  disabled={disabled}
                  onChange={(nextValue) => {
                    updateRoleItem(roleConfig.role, { positionMm: nextValue });
                  }}
                  options={withLegacyPositionOption(item.positionMm)}
                  placeholder="选择相对温区位置"
                  value={item.positionMm}
                />
              </div>
              {showTreatmentParams ? (
                <>
                  <div className="editor-field">
                    <Typography.Text strong>处理参数温度</Typography.Text>
                    <Input
                      aria-label={`处理参数温度 ${roleConfig.title}`}
                      disabled={disabled}
                      onChange={(event) => {
                        updateRoleItem(roleConfig.role, {
                          treatmentTemperatureC: event.target.value,
                        });
                      }}
                      placeholder="°C"
                      value={item.treatmentTemperatureC}
                    />
                  </div>
                  <div className="editor-field">
                    <Typography.Text strong>处理参数时长</Typography.Text>
                    <Input
                      aria-label={`处理参数时长 ${roleConfig.title}`}
                      disabled={disabled}
                      onChange={(event) => {
                        updateRoleItem(roleConfig.role, {
                          treatmentDurationMin: event.target.value,
                        });
                      }}
                      placeholder="min"
                      value={item.treatmentDurationMin}
                    />
                  </div>
                  <div className="editor-field">
                    <Typography.Text strong>处理参数功率</Typography.Text>
                    <Input
                      aria-label={`处理参数功率 ${roleConfig.title}`}
                      disabled={disabled}
                      onChange={(event) => {
                        updateRoleItem(roleConfig.role, { treatmentPowerW: event.target.value });
                      }}
                      placeholder="W"
                      value={item.treatmentPowerW}
                    />
                  </div>
                  <div className="editor-field">
                    <Typography.Text strong>处理参数气体</Typography.Text>
                    <VocabularyCombobox
                      ariaLabel={`处理参数气体 ${roleConfig.title}`}
                      disabled={disabled}
                      onChange={(nextValue) => {
                        updateRoleItem(roleConfig.role, { treatmentGas: nextValue });
                      }}
                      options={gasOptions}
                      placeholder="选择或输入气体"
                      value={item.treatmentGas}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
