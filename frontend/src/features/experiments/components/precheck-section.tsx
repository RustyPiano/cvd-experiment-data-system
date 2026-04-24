import { Input, Radio, Switch, Typography } from "antd";

import type { PrecheckValues } from "../editor-types";

const { TextArea } = Input;
const nullableBooleanOptions = [
  { label: "未检查", value: "" },
  { label: "是", value: "true" },
  { label: "否", value: "false" },
];
const contaminationOptions = [
  { label: "未检查", value: "" },
  { label: "低", value: "low" },
  { label: "中", value: "medium" },
  { label: "高", value: "high" },
];

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
      <div className="editor-field">
        <Typography.Text strong>通风橱已清洁</Typography.Text>
        <Radio.Group
          aria-label="通风橱已清洁"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              hoodClean: event.target.value,
            });
          }}
          optionType="button"
          options={nullableBooleanOptions}
          value={value.hoodClean}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>法兰已堵住</Typography.Text>
        <Radio.Group
          aria-label="法兰已堵住"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              flangeBlocked: event.target.value,
            });
          }}
          optionType="button"
          options={nullableBooleanOptions}
          value={value.flangeBlocked}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>瓷舟污染等级</Typography.Text>
        <Radio.Group
          aria-label="瓷舟污染等级"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              boatContaminationLevel: event.target.value,
            });
          }}
          optionType="button"
          options={contaminationOptions}
          value={value.boatContaminationLevel}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>石英管污染等级</Typography.Text>
        <Radio.Group
          aria-label="石英管污染等级"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              tubeContaminationLevel: event.target.value,
            });
          }}
          optionType="button"
          options={contaminationOptions}
          value={value.tubeContaminationLevel}
        />
      </div>
    </div>
  );
}
