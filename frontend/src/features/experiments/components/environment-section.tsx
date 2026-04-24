import { Input, Typography } from "antd";

import type { EnvironmentValues } from "../editor-types";

const { TextArea } = Input;

export function EnvironmentSection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: EnvironmentValues) => void;
  value: EnvironmentValues;
}) {
  return (
    <div className="editor-form-grid">
      <div className="editor-field">
        <Typography.Text strong>环境温度 (°C)</Typography.Text>
        <Input
          aria-label="环境温度 (°C)"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              indoorTemperatureC: event.target.value,
            });
          }}
          placeholder="例如 25"
          value={value.indoorTemperatureC}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>室内湿度 (%)</Typography.Text>
        <Input
          aria-label="室内湿度 (%)"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              indoorHumidityPercent: event.target.value,
            });
          }}
          placeholder="例如 45"
          value={value.indoorHumidityPercent}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>样品环境</Typography.Text>
        <Input
          aria-label="样品环境"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              sampleEnv: event.target.value,
            });
          }}
          placeholder="例如 clean"
          value={value.sampleEnv}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>异常备注</Typography.Text>
        <TextArea
          aria-label="异常备注"
          autoSize={{ minRows: 3, maxRows: 5 }}
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              abnormalNote: event.target.value,
            });
          }}
          placeholder="记录当日环境或设备异常"
          value={value.abnormalNote}
        />
      </div>
    </div>
  );
}
