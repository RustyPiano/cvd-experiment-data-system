import { Input, Radio, Typography } from "antd";

import type { ResultSummaryValues } from "../editor-types";

const { TextArea } = Input;

export function ResultSummarySection({
  disabled,
  onChange,
  value,
}: {
  disabled: boolean;
  onChange: (nextValue: ResultSummaryValues) => void;
  value: ResultSummaryValues;
}) {
  return (
    <div className="editor-form-grid">
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>质量评级</Typography.Text>
        <Radio.Group
          aria-label="质量评级"
          buttonStyle="solid"
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              qualityLabel: event.target.value,
            });
          }}
          optionType="button"
          options={[
            { label: "未知", value: "unknown" },
            { label: "成功", value: "success" },
            { label: "部分成功", value: "partial" },
            { label: "失败", value: "failed" },
          ]}
          value={value.qualityLabel}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>总结结论</Typography.Text>
        <TextArea
          aria-label="总结结论"
          autoSize={{ minRows: 4, maxRows: 8 }}
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              summaryResult: event.target.value,
            });
          }}
          placeholder="记录当前实验的结果结论、成膜情况或下一步判断"
          value={value.summaryResult}
        />
      </div>
      <div className="editor-field editor-field-wide">
        <Typography.Text strong>下一步建议</Typography.Text>
        <TextArea
          aria-label="下一步建议"
          autoSize={{ minRows: 3, maxRows: 6 }}
          disabled={disabled}
          onChange={(event) => {
            onChange({
              ...value,
              nextStep: event.target.value,
            });
          }}
          placeholder="记录下一轮实验或分析动作"
          value={value.nextStep}
        />
      </div>
    </div>
  );
}
