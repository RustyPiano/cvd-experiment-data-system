import { Input, Typography } from "antd";

import type { BasicInfoValues } from "../editor-types";

const { TextArea } = Input;

export function ExperimentMainFields({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: BasicInfoValues) => void;
  value: BasicInfoValues;
}) {
  return (
    <div className="editor-form-grid">
      <div className="editor-field editor-field-wide">
        <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
          当前后端主记录只支持保存材料体系和实验目的；实验类型与实验日期在这一版先保持只读展示。
        </Typography.Paragraph>
      </div>
      <div className="editor-field">
        <Typography.Text strong>实验类型</Typography.Text>
        <Input
          aria-label="实验类型"
          disabled
          placeholder="例如 cvd_2zone"
          value={value.experimentType}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>材料体系</Typography.Text>
        <Input
          aria-label="材料体系"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              materialSystem: event.target.value,
            });
          }}
          placeholder="例如 MoS2"
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
