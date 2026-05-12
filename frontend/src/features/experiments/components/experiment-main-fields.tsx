import { Input, Select, Typography } from "antd";

import {
  type BasicInfoValues,
  type VocabularySelectOption,
} from "../editor-types";
import { VocabularyCombobox } from "./vocabulary-combobox";

const { TextArea } = Input;

const layerCountOptions = [
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "多层", value: "多层" },
];

export function ExperimentMainFields({
  disabled,
  materialSystemOptions,
  onChange,
  value,
}: {
  disabled: boolean;
  materialSystemOptions: VocabularySelectOption[];
  onChange: (nextValue: BasicInfoValues) => void;
  value: BasicInfoValues;
}) {
  return (
    <div className="editor-form-grid">
      <div className="editor-field editor-field-wide">
        <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
          草稿可修正实验日期；编号保持创建时的历史标识。
        </Typography.Paragraph>
      </div>
      <div className="editor-field">
        <Typography.Text strong>实验类型</Typography.Text>
        <Input
          aria-label="实验类型"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              experimentType: event.target.value,
            });
          }}
          placeholder="例如 cvd_2zone"
          value={value.experimentType}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>材料体系</Typography.Text>
        <VocabularyCombobox
          ariaLabel="材料体系"
          disabled={disabled}
          onChange={(nextValue) => {
            onChange({
              ...value,
              materialSystem: nextValue,
            });
          }}
          options={materialSystemOptions}
          placeholder="选择或输入材料体系"
          value={value.materialSystem}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>实验日期</Typography.Text>
        <Input
          aria-label="实验日期"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              experimentDate: event.target.value,
            });
          }}
          type="date"
          value={value.experimentDate}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>层数</Typography.Text>
        <Select
          allowClear
          aria-label="层数"
          disabled={disabled}
          onChange={(nextValue) => {
            onChange({
              ...value,
              layerCount: nextValue ?? "",
            });
          }}
          options={layerCountOptions}
          placeholder="选择层数"
          value={value.layerCount || undefined}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>实验目的</Typography.Text>
        <TextArea
          aria-label="实验目的"
          autoSize={{ minRows: 3, maxRows: 6 }}
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              objective: event.target.value,
            });
          }}
          placeholder="记录当前实验的目标、变量或预期结果"
          value={value.objective}
        />
      </div>
    </div>
  );
}
