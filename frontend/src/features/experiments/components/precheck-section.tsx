import { Alert, Input, Radio, Typography } from "antd";

import type { PrecheckValues } from "../editor-types";

const { TextArea } = Input;
const nullableBooleanOptions = [
  { label: "未检查", value: "" },
  { label: "是", value: "true" },
  { label: "否", value: "false" },
];
export function PrecheckSection({
  disabled,
  inheritedFrom,
  onChange,
  value,
}: {
  disabled: boolean;
  inheritedFrom?: string;
  onChange: (nextValue: PrecheckValues) => void;
  value: PrecheckValues;
}) {
  return (
    <div className="content-stack">
      {inheritedFrom ? (
        <Alert
          showIcon
          title={`以下参数继承自 ${inheritedFrom}，请确认或修改。`}
          type="info"
        />
      ) : null}
      <div className="editor-field">
        <Typography.Text strong>密封完好</Typography.Text>
        <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
          如果检查失败，需要填写风险说明。
        </Typography.Paragraph>
        <Radio.Group
          aria-label="密封完好"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              sealIntact: event.target.value,
            });
          }}
          optionType="button"
          options={nullableBooleanOptions}
          value={value.sealIntact}
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
        <Typography.Text strong>瓷舟污染</Typography.Text>
        <Radio.Group
          aria-label="瓷舟污染"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              boatContaminationLevel: event.target.value,
            });
          }}
          optionType="button"
          options={nullableBooleanOptions}
          value={value.boatContaminationLevel}
        />
      </div>
      <div className="editor-field">
        <Typography.Text strong>石英管污染</Typography.Text>
        <Radio.Group
          aria-label="石英管污染"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              tubeContaminationLevel: event.target.value,
            });
          }}
          optionType="button"
          options={nullableBooleanOptions}
          value={value.tubeContaminationLevel}
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
