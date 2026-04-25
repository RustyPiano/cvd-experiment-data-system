import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Row, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import type { ExperimentRead } from "../../shared/types/api";
import { PageHeader } from "../../shared/ui/page-header";
import { cloneExperiment, createExperiment, listExperiments } from "./api";
import { HistoryCloneDialog } from "./components/history-clone-dialog";
import { useAuth } from "../auth/use-auth";

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return error.detail || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function ExperimentNewPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { message } = App.useApp();
  const isViewer = session.currentUser?.role === "viewer";
  const [historyCloneOpen, setHistoryCloneOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const navigateToEditor = (experiment: ExperimentRead) => {
    navigate(`/experiments/${experiment.id}/edit`);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createExperiment(session.accessToken!, {
        experiment_type: "cvd",
        material_system: null,
        experiment_date: dayjs().format("YYYY-MM-DD"),
        objective: null,
      }),
    onSuccess: (experiment) => {
      setActionError(null);
      message.success("实验创建成功");
      navigateToEditor(experiment);
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, "创建实验失败"));
    },
  });

  const recentCloneMutation = useMutation({
    mutationFn: async () => {
      const response = await listExperiments(session.accessToken!, {
        mine: true,
        page: 1,
        pageSize: 1,
        status: ["submitted", "locked"],
      });

      const sourceExperiment = response.items[0];
      if (!sourceExperiment) {
        throw new Error("最近没有可复制的已提交或已锁定实验。");
      }

      return cloneExperiment(session.accessToken!, sourceExperiment.id);
    },
    onSuccess: (experiment) => {
      setActionError(null);
      message.success("实验复制成功");
      navigateToEditor(experiment);
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, "复制最近一条实验失败"));
    },
  });

  return (
    <div className="content-stack">
      <PageHeader
        subtitle="支持空白创建、复制最近一条实验，或从历史实验中搜索复制。"
        title="新建实验"
      />
      {isViewer ? (
        <Alert title="当前账号没有创建实验权限。" showIcon type="warning" />
      ) : null}
      {actionError ? <Alert title={actionError} showIcon type="error" /> : null}
      <Row gutter={[16, 16]}>
        <Col md={8} xs={24}>
          <Card className="action-card">
            <Space orientation="vertical" size={12}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                空白 CVD 实验
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                以今天日期创建新的草稿，后续在模块编辑器中补充参数与结果。
              </Typography.Paragraph>
              {!isViewer ? (
                <Button
                  loading={createMutation.isPending}
                  onClick={() => {
                    setActionError(null);
                    createMutation.mutate();
                  }}
                  type="primary"
                >
                  立即创建
                </Button>
              ) : null}
            </Space>
          </Card>
        </Col>
        <Col md={8} xs={24}>
          <Card className="action-card">
            <Space orientation="vertical" size={12}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                复制我的最近一条
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                系统会优先查找你最近更新的一条已提交或已锁定实验，并直接派生出新草稿。
              </Typography.Paragraph>
              {!isViewer ? (
                <Button
                  loading={recentCloneMutation.isPending}
                  onClick={() => {
                    setActionError(null);
                    recentCloneMutation.mutate();
                  }}
                >
                  复制最近一条
                </Button>
              ) : null}
            </Space>
          </Card>
        </Col>
        <Col md={8} xs={24}>
          <Card className="action-card">
            <Space orientation="vertical" size={12}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                从历史实验复制
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                在弹窗里搜索并筛选历史实验，确认来源后直接复制到新的草稿编辑页。
              </Typography.Paragraph>
              {!isViewer ? (
                <Button
                  onClick={() => {
                    setActionError(null);
                    setHistoryCloneOpen(true);
                  }}
                >
                  打开历史实验
                </Button>
              ) : null}
            </Space>
          </Card>
        </Col>
      </Row>

      {session.accessToken && session.currentUser ? (
        <HistoryCloneDialog
          accessToken={session.accessToken}
          currentUserId={session.currentUser.id}
          onCancel={() => {
            setHistoryCloneOpen(false);
          }}
          onCloned={(experiment) => {
            setHistoryCloneOpen(false);
            navigateToEditor(experiment);
          }}
          open={historyCloneOpen}
        />
      ) : null}
    </div>
  );
}
