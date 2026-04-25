import { useState } from "react";
import { ArrowLeftOutlined, DownloadOutlined, EditOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, List, Space, Typography } from "antd";
import { useNavigate, useParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { StatusTag } from "../../shared/ui/status-tag";
import { PageHeader } from "../../shared/ui/page-header";
import { EmptyState } from "../../shared/ui/empty-state";
import { LoadingState } from "../../shared/ui/loading-state";
import { triggerBlobDownload } from "../../shared/lib/download";
import { downloadExperimentExcel, downloadExperimentFile, exportExperimentJson, getExperiment, listExperimentAuditEvents, listExperimentFiles, listExperimentSamples } from "./api";
import { ExperimentSourceBanner } from "./components/experiment-source-banner";
import { ExperimentStateActions } from "./experiment-state-actions";
import { ExperimentSummary } from "./components/experiment-summary";
import { useAuth } from "../auth/use-auth";

function formatFileCategory(value: string) {
  if (value === "raw") return "原始文件";
  if (value === "processed") return "已处理";
  return value;
}

export function ExperimentDetailPage() {
  const { experimentId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const [downloadState, setDownloadState] = useState<"excel" | "json" | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<string | null>(null);
  const [activeFileDownload, setActiveFileDownload] = useState<string | null>(null);
  const experimentQuery = useQuery({
    queryKey: ["experiments", "detail", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });
  const filesQuery = useQuery({
    queryKey: ["experiments", "files", currentUser?.id ?? "anonymous", experimentId, "preview"],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, {
        experimentId,
      }),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });
  const auditQuery = useQuery({
    queryKey: ["experiments", "audit", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => listExperimentAuditEvents(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });
  const samplesQuery = useQuery({
    queryKey: ["experiments", "samples", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => listExperimentSamples(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const resolveErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof HttpError) {
      return error.detail || fallback;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return fallback;
  };

  const handleExportJson = async () => {
    setDownloadState("json");
    setDownloadMessage(null);

    try {
      const payload = await exportExperimentJson(session.accessToken!, experimentId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      triggerBlobDownload(blob, `${experimentQuery.data?.run_code ?? "experiment"}-export.json`);
    } catch (error) {
      setDownloadMessage(resolveErrorMessage(error, "JSON 导出失败"));
    } finally {
      setDownloadState(null);
    }
  };

  const handleExportExcel = async () => {
    setDownloadState("excel");
    setDownloadMessage(null);

    try {
      const payload = await downloadExperimentExcel(session.accessToken!, experimentId);
      triggerBlobDownload(
        payload.blob,
        payload.filename || `${experimentQuery.data?.run_code ?? "experiment"}.xlsx`,
      );
    } catch (error) {
      setDownloadMessage(resolveErrorMessage(error, "Excel 导出失败"));
    } finally {
      setDownloadState(null);
    }
  };

  const handleFileDownload = async (fileId: string, filename: string) => {
    setActiveFileDownload(fileId);
    setDownloadMessage(null);

    try {
      const payload = await downloadExperimentFile(session.accessToken!, fileId);
      triggerBlobDownload(payload.blob, payload.filename || filename);
    } catch (error) {
      setDownloadMessage(resolveErrorMessage(error, "文件下载失败"));
    } finally {
      setActiveFileDownload(null);
    }
  };

  if (experimentQuery.isLoading) {
    return <LoadingState />;
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
          subtitle="无法加载实验详情，请检查网络连接或当前账号权限。"
          title="实验详情"
        />
        <Alert
          title={
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
        title="实验详情暂不可用"
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
              aria-label="返回列表"
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                navigate("/experiments");
              }}
            >
              返回列表
            </Button>
            <Button
              aria-label="管理文件"
              icon={<FolderOpenOutlined />}
              onClick={() => {
                navigate(`/experiments/${experimentId}/files`);
              }}
            >
              管理文件
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
        subtitle="查看实验状态、样品、文件、审计记录，并导出数据。"
        title="实验详情"
      />
      {downloadMessage ? <Alert title={downloadMessage} showIcon type="error" /> : null}
      <ExperimentSourceBanner experiment={experimentQuery.data} />
      {session.accessToken && currentUser ? (
        <Card>
          <div className="content-stack">
            <Space align="center" size={12} wrap>
              <Typography.Text code>{experimentQuery.data.run_code}</Typography.Text>
              <StatusTag status={experimentQuery.data.status} />
            </Space>
            <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
              仅草稿状态可编辑，已提交/已锁定实验仅保留可执行操作。
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
      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            导出
          </Typography.Title>
          <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
            结构化 JSON 适合留档和二次分析，Excel 适合线下共享与手工复核。
          </Typography.Paragraph>
          <Space wrap>
            <Button
              aria-label="导出 JSON"
              icon={<DownloadOutlined />}
              loading={downloadState === "json"}
              onClick={() => {
                void handleExportJson();
              }}
            >
              导出 JSON
            </Button>
            <Button
              aria-label="导出 Excel"
              icon={<DownloadOutlined />}
              loading={downloadState === "excel"}
              onClick={() => {
                void handleExportExcel();
              }}
            >
              导出 Excel
            </Button>
          </Space>
        </div>
      </Card>
      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            样品概览
          </Typography.Title>
          {samplesQuery.isLoading ? (
            <LoadingState />
          ) : samplesQuery.isError ? (
            <Alert
              title={resolveErrorMessage(samplesQuery.error, "样品概览加载失败")}
              showIcon
              type="error"
            />
          ) : (samplesQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState description="当前实验还没有样品记录。在编辑器中添加基底后将自动生成样品。" />
          ) : (
            <List
              dataSource={samplesQuery.data?.items ?? []}
              renderItem={(sample) => (
                <List.Item
                  actions={[
                    <Button
                      key={`sample-${sample.id}`}
                      aria-label={`查看样品 ${sample.sample_code}`}
                      onClick={() => {
                        navigate(`/samples/${sample.id}`);
                      }}
                    >
                      查看样品
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    description={`${sample.role} · ${sample.substrate_type || "未填写基底"}${sample.size_mm ? ` · ${sample.size_mm}` : ""}`}
                    title={sample.sample_code}
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      </Card>
      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            文件概览
          </Typography.Title>
          {filesQuery.isLoading ? (
            <LoadingState />
          ) : filesQuery.isError ? (
            <Alert
              title={resolveErrorMessage(filesQuery.error, "文件概览加载失败")}
              showIcon
              type="error"
            />
          ) : (filesQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState description="当前实验还没有文件记录。进入文件管理页可上传表征原始文件或处理结果。" />
          ) : (
            <List
              dataSource={(filesQuery.data?.items ?? []).slice(0, 5)}
              renderItem={(file) => (
                <List.Item
                  actions={[
                    <Button
                      key={`download-${file.id}`}
                      loading={activeFileDownload === file.id}
                      onClick={() => {
                        void handleFileDownload(file.id, file.original_name);
                      }}
                      size="small"
                    >
                      下载
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    description={`${file.method} · ${formatFileCategory(file.file_category)}${file.note ? ` · ${file.note}` : ""}`}
                    title={file.original_name}
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      </Card>
      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            审计轨迹
          </Typography.Title>
          {auditQuery.isLoading ? (
            <LoadingState />
          ) : auditQuery.isError ? (
            <Alert
              title={resolveErrorMessage(auditQuery.error, "审计轨迹加载失败")}
              showIcon
              type="error"
            />
          ) : (auditQuery.data?.items.length ?? 0) === 0 ? (
            <EmptyState description="当前实验还没有审计事件。创建、编辑、提交和文件操作会自动记录在这里。" />
          ) : (
            <List
              dataSource={(auditQuery.data?.items ?? []).slice().reverse()}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    description={`${item.entity_type} · ${item.reason || "无附加原因"} · ${item.created_at}`}
                    title={<Typography.Text code>{item.action}</Typography.Text>}
                  />
                </List.Item>
              )}
            />
          )}
        </div>
      </Card>
      <ExperimentSummary experiment={experimentQuery.data} />
    </div>
  );
}
