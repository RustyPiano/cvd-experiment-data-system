import { Input, Switch, Typography } from "antd";

import type { PrecheckValues } from "../editor-types";

const { TextArea } = Input;

export function PrecheckSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: PrecheckValues) => void;
  value: PrecheckValues;
}) {
  return (
    <div className="content-stack">
      <div className="editor-switch-row">
        <div>
          <Typography.Text strong>密封完好</Typography.Text>
          <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
            如果检查失败，需要填写风险说明。
          </Typography.Paragraph>
        </div>
        <Switch
          aria-label="密封完好"
          checked={value.sealIntact}
          disabled={disabled}
          onChange={(checked) => {
            onChange({
              ...value,
              sealIntact: checked,
            });
          }}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>风险说明</Typography.Text>
        <TextArea
          aria-label="风险说明"
          autoSize={{ minRows: 3, maxRows: 5 }}
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              riskNote: event.target.value,
            });
          }}
          placeholder="密封、清洁或装片异常时填写"
          value={value.riskNote}
        />
      </div>
    </div>
  );
}
