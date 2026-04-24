import { Input, Typography } from "antd";

import {
  type BasicInfoValues,
  type VocabularySelectOption,
} from "../editor-types";
import { VocabularyCombobox } from "./vocabulary-combobox";

const { TextArea } = Input;

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
          实验日期沿用主记录日期；实验类型会随基础信息模块一起自动保存。
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
          disabled
          type="date"
          value={value.experimentDate}
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
