import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Spin, Typography } from "antd";
import { useNavigate, useParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { PageHeader } from "../../shared/ui/page-header";
import { getExperiment } from "./api";
import { useAuth } from "../auth/use-auth";

export function ExperimentEditorPage() {
  const { experimentId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const experimentQuery = useQuery({
    queryKey: ["experiments", "editor", session.currentUser?.id ?? "anonymous", experimentId],
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
              onClick={() => {
                navigate("/experiments");
              }}
            >
              返回列表
            </Button>
          }
          subtitle="当前请求未成功完成。"
          title="实验编辑器"
        />
        <Alert
          message={
            experimentQuery.error instanceof HttpError
              ? experimentQuery.error.detail || "实验编辑器加载失败"
              : "实验编辑器加载失败"
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
        message="实验编辑器暂不可用"
        showIcon
        type="warning"
      />
    );
  }

  return (
    <div className="content-stack">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              navigate(`/experiments/${experimentQuery.data.id}`);
            }}
          >
            查看详情
          </Button>
        }
        subtitle="实验编辑器会在下一阶段接入模块化表单与自动保存。"
        title={`编辑 ${experimentQuery.data.run_code}`}
      />
      <Alert
        message="模块编辑器开发中"
        showIcon
        type="info"
      />
      <Card>
        <Typography.Paragraph style={{ marginBottom: 0 }}>
          当前已接通实验创建、详情与路由骨架。下一阶段会把 `basic_info / precheck / precursors / substrates / furnace_program / gas_program`
          这批核心模块接入自动保存和提交校验。
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
