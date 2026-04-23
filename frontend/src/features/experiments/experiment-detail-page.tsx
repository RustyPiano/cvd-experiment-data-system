import { ArrowLeftOutlined, EditOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Space, Spin, Typography } from "antd";
import { useNavigate, useParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { StatusTag } from "../../shared/ui/status-tag";
import { PageHeader } from "../../shared/ui/page-header";
import { getExperiment } from "./api";
import { ExperimentStateActions } from "./experiment-state-actions";
import { ExperimentSummary } from "./components/experiment-summary";
import { useAuth } from "../auth/use-auth";

export function ExperimentDetailPage() {
  const { experimentId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const experimentQuery = useQuery({
    queryKey: ["experiments", "detail", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  if (experimentQuery.isLoading) {
    return (
      <div className="centered-panel">
        <Spin />
      </div>
    );
  }

  if (experimentQuery.isError) {
    return (
      <div className="content-stack">
        <PageHeader
          actions={
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                navigate("/experiments");
              }}
            >
              返回列表
            </Button>
          }
          subtitle="当前请求未成功完成。"
          title="实验详情"
        />
        <Alert
          message={
            experimentQuery.error instanceof HttpError
              ? experimentQuery.error.detail || "实验详情加载失败"
              : "实验详情加载失败"
          }
          showIcon
          type="error"
        />
      </div>
    );
  }

  if (!experimentQuery.data) {
    return (
      <Alert
        message="实验详情暂不可用"
        showIcon
        type="warning"
      />
    );
  }

  return (
    <div className="content-stack">
      <PageHeader
        actions={
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                navigate("/experiments");
              }}
            >
              返回列表
            </Button>
            {experimentQuery.data.status === "draft" ? (
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  navigate(`/experiments/${experimentQuery.data.id}/edit`);
                }}
                type="primary"
              >
                继续编辑
              </Button>
            ) : null}
          </Space>
        }
        subtitle="当前详情页已接通实验状态流；文件、审计和导出面板在后续迭代补齐。"
        title="实验详情"
      />
      {session.accessToken && currentUser ? (
        <Card>
          <div className="content-stack">
            <Space align="center" size={12} wrap>
              <Typography.Text code>{experimentQuery.data.run_code}</Typography.Text>
              <StatusTag status={experimentQuery.data.status} />
            </Space>
            <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
              当前页面按后端状态机驱动按钮显示；成员查看他人的已提交或已锁定实验时只保留可执行动作。
            </Typography.Paragraph>
            <ExperimentStateActions
              accessToken={session.accessToken}
              currentUser={currentUser}
              experiment={experimentQuery.data}
              onUpdated={() => undefined}
            />
          </div>
        </Card>
      ) : null}
      <ExperimentSummary experiment={experimentQuery.data} />
    </div>
  );
}
