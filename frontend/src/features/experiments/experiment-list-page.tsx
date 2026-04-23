import { PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Spin } from "antd";
import { useNavigate } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { PageHeader } from "../../shared/ui/page-header";
import { listExperiments } from "./api";
import { ExperimentTable } from "./components/experiment-table";
import { useAuth } from "../auth/use-auth";

export function ExperimentListPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const canCreateExperiment = session.currentUser?.role !== "viewer";
  const experimentQuery = useQuery({
    queryKey: ["experiments", "list", session.currentUser?.id ?? "anonymous"],
    queryFn: () => listExperiments(session.accessToken!),
    enabled: session.isAuthenticated,
  });

  return (
    <div className="content-stack">
      <PageHeader
        actions={
          canCreateExperiment ? (
            <Button
              aria-label="新建实验"
              icon={<PlusOutlined />}
              onClick={() => {
                navigate("/experiments/new");
              }}
              type="primary"
            >
              新建实验
            </Button>
          ) : undefined
        }
        subtitle="管理 CVD 实验、样品、表征文件和导出任务。"
        title="实验记录"
      />

      {experimentQuery.isError ? (
        <Alert
          message={
            experimentQuery.error instanceof HttpError
              ? experimentQuery.error.detail || "实验列表加载失败"
              : "实验列表加载失败"
          }
          showIcon
          type="error"
        />
      ) : null}

      <Card>
        {experimentQuery.isLoading ? (
          <div className="centered-panel">
            <Spin />
          </div>
        ) : (
          <ExperimentTable items={experimentQuery.data?.items ?? []} loading={false} />
        )}
      </Card>
    </div>
  );
}
