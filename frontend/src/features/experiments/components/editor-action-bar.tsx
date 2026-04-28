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
  onBack,
  onPrev,
  onNext,
  onSubmit,
  saveSummary,
  submitState,
}: {
  completionSummary: CompletionSummary;
  experiment: ExperimentRead;
  isDraft: boolean;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit: () => void;
  saveSummary: string;
  submitState: SubmitState;
}) {
  const completionText = `总完成度 ${completionSummary.percent}% · 已完成 ${completionSummary.completedCount}/${completionSummary.totalCount} · 阻塞 ${completionSummary.blockingCount} · 提示 ${completionSummary.warningCount}`;

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
          <Typography.Paragraph style={{ marginBottom: 0, marginTop: 8 }} type="secondary">
            {isDraft
              ? "草稿会区块级自动保存；提交前会先执行后端校验。"
              : "当前实验已离开 draft 状态，编辑器保持只读。"}
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button onClick={onBack}>返回详情</Button>
          {isDraft ? (
            <>
              {onPrev ? (
                <Button onClick={onPrev} size="small">
                  上一步
                </Button>
              ) : null}
              {onNext ? (
                <Button onClick={onNext} size="small">
                  下一步
                </Button>
              ) : null}
              <Button
                loading={submitState.status === "submitting"}
                onClick={() => {
                  void onSubmit();
                }}
                type="primary"
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
