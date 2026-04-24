import { useMutation } from "@tanstack/react-query";
import { Alert, Button, Card, Col, Row, Space, Typography } from "antd";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { PageHeader } from "../../shared/ui/page-header";
import { createExperiment } from "./api";
import { useAuth } from "../auth/use-auth";

export function ExperimentNewPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const isViewer = session.currentUser?.role === "viewer";
  const createMutation = useMutation({
    mutationFn: () =>
      createExperiment(session.accessToken!, {
        experiment_type: "cvd",
        material_system: null,
        experiment_date: dayjs().format("YYYY-MM-DD"),
        objective: null,
      }),
    onSuccess: (experiment) => {
      navigate(`/experiments/${experiment.id}/edit`);
    },
  });

  const createErrorMessage =
    createMutation.error instanceof HttpError
      ? createMutation.error.detail || "创建实验失败"
      : createMutation.error instanceof Error
        ? createMutation.error.message
        : null;

  return (
    <div className="content-stack">
      <PageHeader
        subtitle="创建空白实验草稿或从已锁定的历史实验派生。"
        title="新建实验"
      />
      {isViewer ? (
        <Alert message="当前账号没有创建实验权限。" showIcon type="warning" />
      ) : null}
      {createErrorMessage ? (
        <Alert message={createErrorMessage} showIcon type="error" />
      ) : null}
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Card className="action-card">
            <Space direction="vertical" size={12}>
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
        <Col span={12}>
          <Card className="action-card">
            <Space direction="vertical" size={12}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                从历史实验复制
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                仅可从已锁定实验派生新草稿，请进入历史实验详情页操作。
              </Typography.Paragraph>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
