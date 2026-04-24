import { Alert, Button, Card, Space, Typography } from "antd";

import type { ExperimentRead } from "../../../shared/types/api";
import { StatusTag } from "../../../shared/ui/status-tag";

type SubmitState = {
  status: "idle" | "submitting" | "error";
  message: string | null;
};

export function EditorStatusBar({
  experiment,
  isDraft,
  onSubmit,
  submitState,
  summary,
}: {
  experiment: ExperimentRead;
  isDraft: boolean;
  onSubmit: () => void;
  submitState: SubmitState;
  summary: string;
}) {
  return (
    <Card>
      <div className="editor-status-bar">
        <div>
          <Space align="center" size={12} wrap>
            <Typography.Text code>{experiment.run_code}</Typography.Text>
            <StatusTag status={experiment.status} />
            <Typography.Text type="secondary">{summary}</Typography.Text>
          </Space>
          <Typography.Paragraph style={{ marginBottom: 0, marginTop: 8 }} type="secondary">
            {isDraft
              ? "当前草稿支持自动保存。提交前请确认关键模块已填写完成。"
              : "当前实验已离开 draft 状态，编辑器保持只读。"}
          </Typography.Paragraph>
        </div>
        {isDraft ? (
          <Button
            loading={submitState.status === "submitting"}
            onClick={() => {
              void onSubmit();
            }}
            type="primary"
          >
            提交实验
          </Button>
        ) : null}
      </div>
      {submitState.status === "error" && submitState.message ? (
        <Alert
          message={submitState.message}
          showIcon
          style={{ marginTop: 16 }}
          type="error"
        />
      ) : null}
    </Card>
  );
}
