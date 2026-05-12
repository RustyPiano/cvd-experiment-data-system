import { Alert, Button, Card, Space, Typography } from "antd";

import type { ExperimentRead } from "../../../shared/types/api";
import { StatusTag } from "../../../shared/ui/status-tag";
import type { CompletionSummary } from "./completion-indicator";

type SubmitState = {
  status: "idle" | "submitting" | "error";
  message: string | null;
};

export function EditorActionBar({
  completionSummary,
  experiment,
  isDraft,
  onSaveDraft,
  onSubmit,
  saveDraftLoading,
  saveSummary,
  submitState,
}: {
  completionSummary: CompletionSummary;
  experiment: ExperimentRead;
  isDraft: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
  saveDraftLoading: boolean;
  saveSummary: string;
  submitState: SubmitState;
}) {
  const completionText = `总完成度 ${completionSummary.percent}% · 已完成 ${completionSummary.completedCount}/${completionSummary.totalCount} · 阻塞 ${completionSummary.blockingCount} · 提示 ${completionSummary.warningCount}`;
  const isSubmitDeemphasized =
    completionSummary.blockingCount > 0 || submitState.status === "error";

  return (
    <Card className="editor-action-bar">
      <div className="editor-action-bar-content">
        <div>
          <Space align="center" size={12} wrap>
            <Typography.Text code>{experiment.run_code}</Typography.Text>
            <StatusTag status={experiment.status} />
            <Typography.Text type="secondary">{saveSummary}</Typography.Text>
            <Typography.Text className="editor-completion-summary" type="secondary">
              {completionText}
            </Typography.Text>
          </Space>
          {!isDraft ? (
            <Typography.Paragraph style={{ marginBottom: 0, marginTop: 8 }} type="secondary">
              当前实验已离开 draft 状态，编辑器保持只读。
            </Typography.Paragraph>
          ) : null}
        </div>
        <Space wrap>
          {isDraft ? (
            <>
              <Button
                loading={saveDraftLoading}
                onClick={() => {
                  void onSaveDraft();
                }}
              >
                保存草稿
              </Button>
              <Button
                loading={submitState.status === "submitting"}
                onClick={() => {
                  void onSubmit();
                }}
                type={isSubmitDeemphasized ? "default" : "primary"}
              >
                提交实验
              </Button>
            </>
          ) : null}
        </Space>
      </div>
      {submitState.status === "error" && submitState.message ? (
        <Alert showIcon style={{ marginTop: 16 }} title={submitState.message} type="error" />
      ) : null}
    </Card>
  );
}
