import { Input, Typography } from "antd";

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
    <div className="editor-field">
      <Typography.Text strong>总结结论</Typography.Text>
      <TextArea
        aria-label="总结结论"
        autoSize={{ minRows: 4, maxRows: 8 }}
        disabled={disabled}
        onChange={(event) => {
          onChange({
            summaryResult: event.target.value,
          });
        }}
        placeholder="记录当前实验的结果结论、成膜情况或下一步判断"
        value={value.summaryResult}
      />
    </div>
  );
}
