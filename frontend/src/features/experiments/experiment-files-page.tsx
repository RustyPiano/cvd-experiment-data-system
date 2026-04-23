import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Input,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { ArrowLeftOutlined, DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { useNavigate, useParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { EmptyState } from "../../shared/ui/empty-state";
import { PageHeader } from "../../shared/ui/page-header";
import type { FileAssetRead } from "../../shared/types/api";
import { triggerBlobDownload } from "../../shared/lib/download";
import { useAuth } from "../auth/use-auth";
import {
  deleteExperimentFile,
  downloadExperimentFile,
  getExperiment,
  listActiveVocabularies,
  listExperimentFiles,
  listExperimentSamples,
  uploadExperimentFile,
} from "./api";

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return error.detail || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KiB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function ExperimentFilesPage() {
  const { experimentId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const [methodFilter, setMethodFilter] = useState("");
  const [fileCategoryFilter, setFileCategoryFilter] = useState("");
  const [uploadMethod, setUploadMethod] = useState("");
  const [uploadSampleId, setUploadSampleId] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [fileCategory, setFileCategory] = useState("raw");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [downloadFileId, setDownloadFileId] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);

  const experimentQuery = useQuery({
    queryKey: ["experiments", "detail", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const filesQuery = useQuery({
    queryKey: [
      "experiments",
      "files",
      currentUser?.id ?? "anonymous",
      experimentId,
      methodFilter,
      fileCategoryFilter,
    ],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, {
        experimentId,
        fileCategory: fileCategoryFilter || null,
        method: methodFilter || null,
      }),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const samplesQuery = useQuery({
    queryKey: ["experiments", "samples", currentUser?.id ?? "anonymous", experimentId],
    queryFn: () => listExperimentSamples(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const vocabulariesQuery = useQuery({
    queryKey: ["vocabularies", "characterization_method", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "characterization_method"),
    enabled: session.isAuthenticated,
  });

  const canManageFiles =
    currentUser !== null &&
    experimentQuery.data !== undefined &&
    experimentQuery.data.status === "draft" &&
    currentUser.role !== "viewer" &&
    (currentUser.role === "admin" || currentUser.id === experimentQuery.data.owner_id);

  const sampleCodeById = useMemo(() => {
    const sampleMap = new Map<string, string>();
    for (const sample of samplesQuery.data?.items ?? []) {
      sampleMap.set(sample.id, sample.sample_code);
    }
    return sampleMap;
  }, [samplesQuery.data?.items]);

  const invalidateFileQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["experiments", "files", currentUser?.id ?? "anonymous", experimentId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["experiments", "audit", currentUser?.id ?? "anonymous", experimentId],
      }),
    ]);
  };

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) {
        throw new Error("请选择要上传的文件");
      }

      return uploadExperimentFile(session.accessToken!, experimentId, {
        file: selectedFile,
        fileCategory,
        method: uploadMethod.trim(),
        note: uploadNote.trim() || undefined,
        sampleId: uploadSampleId || null,
      });
    },
    onSuccess: async () => {
      setMutationMessage(null);
      setSelectedFile(null);
      setUploadMethod("");
      setUploadSampleId("");
      setUploadNote("");
      setFileCategory("raw");
      setFileInputKey((current) => current + 1);
      await invalidateFileQueries();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteExperimentFile(session.accessToken!, fileId),
    onSuccess: async () => {
      setMutationMessage(null);
      await invalidateFileQueries();
    },
  });

  const handleDownload = async (file: FileAssetRead) => {
    setMutationMessage(null);
    setDownloadFileId(file.id);

    try {
      const payload = await downloadExperimentFile(session.accessToken!, file.id);
      triggerBlobDownload(payload.blob, payload.filename || file.original_name);
    } catch (error) {
      setMutationMessage(resolveErrorMessage(error, "文件下载失败"));
    } finally {
      setDownloadFileId(null);
    }
  };

  const validateUploadForm = () => {
    if (!selectedFile) {
      setMutationMessage("请选择要上传的文件");
      return false;
    }

    if (!uploadMethod.trim()) {
      setMutationMessage("请先填写文件方法");
      return false;
    }

    return true;
  };

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
          title="实验文件"
        />
        <Alert
          title={resolveErrorMessage(experimentQuery.error, "实验文件页加载失败")}
          showIcon
          type="error"
        />
      </div>
    );
  }

  if (!experimentQuery.data) {
    return <Alert title="实验文件页暂不可用" showIcon type="warning" />;
  }

  const fileRows = filesQuery.data?.items ?? [];

  return (
    <div className="content-stack">
      <PageHeader
        actions={
          <Button
            aria-label="返回实验"
            icon={<ArrowLeftOutlined />}
            onClick={() => {
              navigate(`/experiments/${experimentQuery.data.id}`);
            }}
          >
            返回实验
          </Button>
        }
        subtitle="上传只对 draft 实验开放；详情页与导出会自动读取这里的最新文件元数据。"
        title={`文件管理 · ${experimentQuery.data.run_code}`}
      />

      {mutationMessage ? <Alert title={mutationMessage} showIcon type="error" /> : null}
      {uploadMutation.isError ? (
        <Alert
          title={resolveErrorMessage(uploadMutation.error, "文件上传失败")}
          showIcon
          type="error"
        />
      ) : null}
      {deleteMutation.isError ? (
        <Alert
          title={resolveErrorMessage(deleteMutation.error, "文件删除失败")}
          showIcon
          type="error"
        />
      ) : null}

      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            上传文件
          </Typography.Title>
          <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
            当前实验状态：{experimentQuery.data.status}。{canManageFiles ? "可直接上传和删除。" : "当前仅允许浏览和下载。"}
          </Typography.Paragraph>
          {canManageFiles ? (
            <div
              style={{
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <label>
                <Typography.Text strong>文件方法</Typography.Text>
                <Input
                  aria-label="文件方法"
                  list="file-method-options"
                  onChange={(event) => {
                    setUploadMethod(event.target.value);
                  }}
                  placeholder="例如 Raman / OM / SEM"
                  value={uploadMethod}
                />
              </label>
              <label>
                <Typography.Text strong>文件类别</Typography.Text>
                <select
                  aria-label="文件类别"
                  onChange={(event) => {
                    setFileCategory(event.target.value);
                  }}
                  value={fileCategory}
                >
                  <option value="raw">raw</option>
                  <option value="processed">processed</option>
                </select>
              </label>
              <label>
                <Typography.Text strong>关联样品</Typography.Text>
                <select
                  aria-label="关联样品"
                  onChange={(event) => {
                    setUploadSampleId(event.target.value);
                  }}
                  value={uploadSampleId}
                >
                  <option value="">不关联样品</option>
                  {(samplesQuery.data?.items ?? []).map((sample) => (
                    <option key={sample.id} value={sample.id}>
                      {sample.sample_code}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <Typography.Text strong>文件备注</Typography.Text>
                <Input
                  aria-label="文件备注"
                  onChange={(event) => {
                    setUploadNote(event.target.value);
                  }}
                  placeholder="补充描述采集条件或处理说明"
                  value={uploadNote}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                <Typography.Text strong>选择文件</Typography.Text>
                <input
                  key={fileInputKey}
                  aria-label="选择文件"
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                  }}
                  type="file"
                />
              </label>
              <Button
                aria-label="上传文件"
                icon={<UploadOutlined />}
                loading={uploadMutation.isPending}
                onClick={() => {
                  if (!validateUploadForm()) {
                    return;
                  }

                  setMutationMessage(null);
                  uploadMutation.mutate();
                }}
                type="primary"
              >
                上传文件
              </Button>
            </div>
          ) : (
            <Alert title="当前账号或实验状态不允许修改文件。" showIcon type="info" />
          )}

          <datalist id="file-method-options">
            {(vocabulariesQuery.data?.items ?? []).map((item) => (
              <option key={item.id} value={item.value}>
                {item.label_zh}
              </option>
            ))}
          </datalist>
        </div>
      </Card>

      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            文件列表
          </Typography.Title>
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <label>
              <Typography.Text strong>筛选方法</Typography.Text>
              <Input
                aria-label="筛选方法"
                onChange={(event) => {
                  setMethodFilter(event.target.value);
                }}
                placeholder="输入方法名称"
                value={methodFilter}
              />
            </label>
            <label>
              <Typography.Text strong>筛选类别</Typography.Text>
              <select
                aria-label="筛选类别"
                onChange={(event) => {
                  setFileCategoryFilter(event.target.value);
                }}
                value={fileCategoryFilter}
              >
                <option value="">全部</option>
                <option value="raw">raw</option>
                <option value="processed">processed</option>
              </select>
            </label>
          </div>

          {filesQuery.isError ? (
            <Alert
              title={resolveErrorMessage(filesQuery.error, "文件列表加载失败")}
              showIcon
              type="error"
            />
          ) : null}

          {filesQuery.isLoading ? (
            <div className="centered-panel">
              <Spin />
            </div>
          ) : fileRows.length === 0 ? (
            <EmptyState description="当前筛选条件下没有文件记录。" />
          ) : (
            <Table<FileAssetRead>
              dataSource={fileRows}
              pagination={false}
              rowKey="id"
              columns={[
                {
                  dataIndex: "original_name",
                  key: "original_name",
                  title: "文件名",
                  render: (_, file) => (
                    <div className="content-stack" style={{ gap: 4 }}>
                      <Typography.Text strong>{file.original_name}</Typography.Text>
                      {file.metadata_json.duplicate_in_experiment ? (
                        <Tag color="orange">实验内重复</Tag>
                      ) : null}
                    </div>
                  ),
                },
                {
                  dataIndex: "method",
                  key: "method",
                  title: "方法",
                },
                {
                  dataIndex: "file_category",
                  key: "file_category",
                  title: "类别",
                },
                {
                  key: "sample_id",
                  title: "样品",
                  render: (_, file) => {
                    if (!file.sample_id) {
                      return "未关联";
                    }

                    const sampleCode = sampleCodeById.get(file.sample_id) || file.sample_id;
                    return (
                      <Button
                        aria-label={`查看样品 ${sampleCode}`}
                        onClick={() => {
                          navigate(`/samples/${file.sample_id}`);
                        }}
                        type="link"
                      >
                        {sampleCode}
                      </Button>
                    );
                  },
                },
                {
                  dataIndex: "size_bytes",
                  key: "size_bytes",
                  title: "大小",
                  render: (value: number) => formatBytes(value),
                },
                {
                  dataIndex: "created_at",
                  key: "created_at",
                  title: "上传时间",
                  render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm"),
                },
                {
                  dataIndex: "note",
                  key: "note",
                  title: "备注",
                  render: (value: string | null) => value || "无",
                },
                {
                  key: "actions",
                  title: "操作",
                  render: (_, file) => (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        aria-label={`下载 ${file.original_name}`}
                        icon={<DownloadOutlined />}
                        loading={downloadFileId === file.id}
                        onClick={() => {
                          void handleDownload(file);
                        }}
                      >
                        下载
                      </Button>
                      {canManageFiles ? (
                        <Button
                          aria-label={`删除 ${file.original_name}`}
                          danger
                          loading={deleteMutation.isPending && deleteMutation.variables === file.id}
                          onClick={() => {
                            setMutationMessage(null);
                            deleteMutation.mutate(file.id);
                          }}
                        >
                          删除
                        </Button>
                      ) : null}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
