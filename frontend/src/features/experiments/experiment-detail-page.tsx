import { ArrowLeftOutlined, EditOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Space, Spin } from "antd";
import { useNavigate, useParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { PageHeader } from "../../shared/ui/page-header";
import { getExperiment } from "./api";
import { ExperimentSummary } from "./components/experiment-summary";
import { useAuth } from "../auth/use-auth";

export function ExperimentDetailPage() {
  const { experimentId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const experimentQuery = useQuery({
    queryKey: ["experiments", "detail", session.currentUser?.id ?? "anonymous", experimentId],
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
        subtitle="当前阶段先提供详情总览，文件、审计和导出面板在后续迭代补齐。"
        title="实验详情"
      />
      <ExperimentSummary experiment={experimentQuery.data} />
    </div>
  );
}
