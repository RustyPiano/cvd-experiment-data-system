import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography } from "antd";
import { ArrowLeftOutlined, DownloadOutlined, FolderOpenOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useBlocker, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "../auth/use-auth";
import { getExperiment, listExperimentFiles } from "../experiments/api";
import { getSample, updateSample } from "./api";
import { HttpError } from "../../shared/api/http-error";
import { triggerBlobDownload } from "../../shared/lib/download";
import { PageHeader } from "../../shared/ui/page-header";
import { EmptyState } from "../../shared/ui/empty-state";
import { LoadingState } from "../../shared/ui/loading-state";
import { StatusTag } from "../../shared/ui/status-tag";
import type { FileAssetRead, SampleRead, SampleUpdateRequest } from "../../shared/types/api";
import { downloadExperimentFile } from "../experiments/api";

type SampleFieldKey = keyof SampleUpdateRequest;

type SampleFormState = {
  substrateType: string;
  brand: string;
  sizeMm: string;
  treatment: string;
  positionMm: string;
  storageLocation: string;
  metadataJson: string;
};

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return error.detail || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function buildFormState(sample: SampleRead): SampleFormState {
  return {
    substrateType: sample.substrate_type ?? "",
    brand: sample.brand ?? "",
    sizeMm: sample.size_mm ?? "",
    treatment: sample.treatment ?? "",
    positionMm: sample.position_mm === null ? "" : String(sample.position_mm),
    storageLocation: sample.storage_location ?? "",
    metadataJson: JSON.stringify(sample.metadata_json ?? {}, null, 2),
  };
}

function toNullableString(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function validateMetadataJson(rawValue: string): string | null {
  const normalized = rawValue.trim();
  if (!normalized) return null;
  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return "元数据 JSON 必须是对象";
    }
    return null;
  } catch {
    return "元数据 JSON 格式无效";
  }
}

function buildSampleUpdatePayload(
  formState: SampleFormState,
  dirtyFields: SampleFieldKey[],
): SampleUpdateRequest {
  const payload: SampleUpdateRequest = {};
  const dirtyFieldSet = new Set(dirtyFields);

  if (dirtyFieldSet.has("substrate_type")) {
    payload.substrate_type = toNullableString(formState.substrateType);
  }

  if (dirtyFieldSet.has("brand")) {
    payload.brand = toNullableString(formState.brand);
  }

  if (dirtyFieldSet.has("size_mm")) {
    payload.size_mm = toNullableString(formState.sizeMm);
  }

  if (dirtyFieldSet.has("treatment")) {
    payload.treatment = toNullableString(formState.treatment);
  }

  if (dirtyFieldSet.has("position_mm")) {
    const trimmedPosition = formState.positionMm.trim();
    if (!trimmedPosition) {
      payload.position_mm = null;
    } else {
      const parsedPosition = Number(trimmedPosition);
      if (!Number.isFinite(parsedPosition)) {
        throw new Error("位置 (mm) 必须是有限数字");
      }
      payload.position_mm = parsedPosition;
    }
  }

  if (dirtyFieldSet.has("storage_location")) {
    payload.storage_location = toNullableString(formState.storageLocation);
  }

  if (dirtyFieldSet.has("metadata_json")) {
    let parsedMetadata: Record<string, unknown>;
    try {
      parsedMetadata = JSON.parse(formState.metadataJson || "{}") as Record<string, unknown>;
    } catch {
      throw new Error("元数据 JSON 格式无效");
    }

    if (
      parsedMetadata === null ||
      Array.isArray(parsedMetadata) ||
      typeof parsedMetadata !== "object"
    ) {
      throw new Error("元数据 JSON 必须是对象");
    }

    payload.metadata_json = parsedMetadata;
  }

  return payload;
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

function SampleLeaveGuard({ when }: { when: boolean }) {
  const blocker = useBlocker(when);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    Modal.confirm({
      title: "离开确认",
      content: "样品信息尚未保存，确认离开吗？",
      okText: "离开",
      cancelText: "留下",
      onOk: () => {
        blocker.proceed();
      },
      onCancel: () => {
        blocker.reset();
      },
    });
  }, [blocker]);

  return null;
}

export function SampleDetailPage() {
  const { sampleId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const viewerKey = currentUser?.id ?? "anonymous";
  const [draftFormState, setDraftFormState] = useState<{
    dirtyFields: SampleFieldKey[];
    form: SampleFormState;
    revision: string;
  } | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [downloadFileId, setDownloadFileId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const autosaveTimerRef = useRef<number | null>(null);

  const sampleQuery = useQuery({
    queryKey: ["samples", "detail", viewerKey, sampleId],
    queryFn: () => getSample(session.accessToken!, sampleId),
    enabled: session.isAuthenticated && Boolean(sampleId),
  });

  const experimentId = sampleQuery.data?.experiment_run_id ?? "";
  const experimentQuery = useQuery({
    queryKey: ["experiments", "detail", viewerKey, experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const filesQuery = useQuery({
    queryKey: ["samples", "files", viewerKey, sampleId],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, {
        experimentId,
        sampleId,
      }),
    enabled: session.isAuthenticated && Boolean(experimentId) && Boolean(sampleId),
  });

  const sampleRevision = sampleQuery.data
    ? `${sampleQuery.data.id}:${sampleQuery.data.updated_at}`
    : null;
  const formState =
    draftFormState && draftFormState.revision === sampleRevision
      ? draftFormState.form
      : sampleQuery.data
        ? buildFormState(sampleQuery.data)
        : null;

  const metadataJsonError = formState ? validateMetadataJson(formState.metadataJson) : null;

  const canEdit =
    currentUser !== null &&
    experimentQuery.data !== undefined &&
    experimentQuery.data.status === "draft" &&
    currentUser.role !== "viewer" &&
    (currentUser.role === "admin" || currentUser.id === experimentQuery.data.owner_id);
  const hasDirtyFields =
    draftFormState !== null &&
    draftFormState.revision === sampleRevision &&
    draftFormState.dirtyFields.length > 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draftFormState || draftFormState.revision !== sampleRevision) {
        throw new Error("样品表单暂不可用");
      }

      setSaveStatus("saving");
      return updateSample(
        session.accessToken!,
        sampleId,
        buildSampleUpdatePayload(draftFormState.form, draftFormState.dirtyFields),
      );
    },
    onSuccess: async (savedSample) => {
      setSaveStatus("saved");
      setDraftFormState(null);
      queryClient.setQueryData(["samples", "detail", viewerKey, sampleId], savedSample);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["experiments", "samples", viewerKey, savedSample.experiment_run_id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["experiments", "detail", viewerKey, savedSample.experiment_run_id],
        }),
      ]);
    },
    onError: (error) => {
      setSaveStatus("error");
      setMessage({
        text: resolveErrorMessage(error, "样品保存失败"),
        type: "error",
      });
    },
  });
  const formDisabled = !canEdit || saveMutation.isPending;

  const handleDownload = async (file: FileAssetRead) => {
    setMessage(null);
    setDownloadFileId(file.id);

    try {
      const payload = await downloadExperimentFile(session.accessToken!, file.id);
      triggerBlobDownload(payload.blob, payload.filename || file.original_name);
    } catch (error) {
      setMessage({
        text: resolveErrorMessage(error, "文件下载失败"),
        type: "error",
      });
    } finally {
      setDownloadFileId(null);
    }
  };

  const fileRows = useMemo(() => filesQuery.data?.items ?? [], [filesQuery.data?.items]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      if (!hasDirtyFields || metadataJsonError || saveMutation.isPending) {
        return;
      }

      setMessage(null);
      saveMutation.mutate();
    }, 900);
  }, [hasDirtyFields, metadataJsonError, saveMutation]);

  const updateFormState = (
    field: SampleFieldKey,
    updater: (current: SampleFormState) => SampleFormState,
  ) => {
    if (!sampleQuery.data || !sampleRevision) {
      return;
    }

    setDraftFormState((current) => {
      const base =
        current && current.revision === sampleRevision
          ? current.form
          : buildFormState(sampleQuery.data);
      const currentDirtyFields =
        current && current.revision === sampleRevision ? current.dirtyFields : [];
      return {
        dirtyFields: currentDirtyFields.includes(field)
          ? currentDirtyFields
          : [...currentDirtyFields, field],
        form: updater(base),
        revision: sampleRevision,
      };
    });

    if (canEdit) {
      scheduleAutosave();
    }
  };

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hasDirtyFields && !saveMutation.isPending) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasDirtyFields, saveMutation.isPending]);

  if (sampleQuery.isLoading) {
    return <LoadingState />;
  }

  if (sampleQuery.isError) {
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
          subtitle="无法加载样品详情，请检查网络连接或当前账号权限。"
          title="样品详情"
        />
        <Alert
          message={resolveErrorMessage(sampleQuery.error, "样品详情加载失败")}
          showIcon
          type="error"
        />
      </div>
    );
  }

  if (!sampleQuery.data) {
    return <Alert message="样品详情暂不可用" showIcon type="warning" />;
  }

  return (
    <div className="content-stack">
      <SampleLeaveGuard when={hasDirtyFields && !saveMutation.isPending} />
      <PageHeader
        actions={
          <Space wrap>
            <Button
              aria-label="返回实验"
              icon={<ArrowLeftOutlined />}
              onClick={() => {
                navigate(`/experiments/${sampleQuery.data.experiment_run_id}`);
              }}
            >
              返回实验
            </Button>
            <Button
              aria-label="管理实验文件"
              icon={<FolderOpenOutlined />}
              onClick={() => {
                navigate(`/experiments/${sampleQuery.data.experiment_run_id}/files`);
              }}
            >
              管理实验文件
            </Button>
          </Space>
        }
        subtitle="查看和编辑样品信息，浏览关联文件。仅草稿实验可编辑。"
        title={`样品详情 · ${sampleQuery.data.sample_code}`}
      />

      {message ? (
        <Alert
          message={message.text}
          showIcon
          type={message.type}
        />
      ) : null}
      {canEdit && saveStatus === "saving" ? (
        <Alert message="正在自动保存..." showIcon type="info" />
      ) : null}
      {canEdit && saveStatus === "saved" && !hasDirtyFields ? (
        <Alert message="已自动保存" showIcon type="success" />
      ) : null}

      <Card>
        <div className="content-stack">
          <Space align="center" size={12} wrap>
            <Typography.Text code>{sampleQuery.data.sample_code}</Typography.Text>
            <Tag color="blue">{sampleQuery.data.role}</Tag>
            {experimentQuery.data ? <StatusTag status={experimentQuery.data.status} /> : null}
          </Space>
          <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
            实验编号：{experimentQuery.data?.run_code ?? sampleQuery.data.experiment_run_id}
          </Typography.Paragraph>
          {sampleQuery.data.parent_sample_id ? (
            <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
              父样品：{sampleQuery.data.parent_sample_id}
            </Typography.Paragraph>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            样品信息
          </Typography.Title>
          {experimentQuery.isLoading ? (
            <LoadingState />
          ) : experimentQuery.isError ? (
            <Alert
              message={resolveErrorMessage(experimentQuery.error, "关联实验加载失败")}
              showIcon
              type="error"
            />
          ) : formState ? (
            <>
              {!canEdit ? (
                <Alert
                  message="当前样品来自非 draft 实验，暂不可编辑。"
                  showIcon
                  type="info"
                />
              ) : null}
              <Form layout="vertical">
                <div
                  style={{
                    display: "grid",
                    gap: 0,
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  }}
                >
                  <Form.Item label="基底类型">
                    <Input
                      aria-label="基底类型"
                      disabled={formDisabled}
                      onChange={(event) => {
                        updateFormState("substrate_type", (current) => ({
                          ...current,
                          substrateType: event.target.value,
                        }));
                      }}
                      value={formState.substrateType}
                    />
                  </Form.Item>
                  <Form.Item label="品牌">
                    <Input
                      aria-label="品牌"
                      disabled={formDisabled}
                      onChange={(event) => {
                        updateFormState("brand", (current) => ({
                          ...current,
                          brand: event.target.value,
                        }));
                      }}
                      value={formState.brand}
                    />
                  </Form.Item>
                  <Form.Item label="尺寸">
                    <Input
                      aria-label="尺寸"
                      disabled={formDisabled}
                      onChange={(event) => {
                        updateFormState("size_mm", (current) => ({
                          ...current,
                          sizeMm: event.target.value,
                        }));
                      }}
                      value={formState.sizeMm}
                    />
                  </Form.Item>
                  <Form.Item label="位置 (mm)">
                    <InputNumber
                      aria-label="位置 (mm)"
                      disabled={formDisabled}
                      onChange={(value) => {
                        updateFormState("position_mm", (current) => ({
                          ...current,
                          positionMm: value === null ? "" : String(value),
                        }));
                      }}
                      stringMode
                      style={{ width: "100%" }}
                      value={formState.positionMm === "" ? null : formState.positionMm}
                    />
                  </Form.Item>
                  <Form.Item label="处理方式" style={{ gridColumn: "1 / -1" }}>
                    <Input.TextArea
                      aria-label="处理方式"
                      autoSize={{ minRows: 2, maxRows: 4 }}
                      disabled={formDisabled}
                      onChange={(event) => {
                        updateFormState("treatment", (current) => ({
                          ...current,
                          treatment: event.target.value,
                        }));
                      }}
                      value={formState.treatment}
                    />
                  </Form.Item>
                  <Form.Item label="存放位置">
                    <Input
                      aria-label="存放位置"
                      disabled={formDisabled}
                      onChange={(event) => {
                        updateFormState("storage_location", (current) => ({
                          ...current,
                          storageLocation: event.target.value,
                        }));
                      }}
                      value={formState.storageLocation}
                    />
                  </Form.Item>
                  <Form.Item
                    label="元数据 JSON"
                    style={{ gridColumn: "1 / -1" }}
                    validateStatus={metadataJsonError ? "error" : undefined}
                    help={metadataJsonError}
                  >
                    <Input.TextArea
                      aria-label="元数据 JSON"
                      autoSize={{ minRows: 6, maxRows: 12 }}
                      disabled={formDisabled}
                      onChange={(event) => {
                        updateFormState("metadata_json", (current) => ({
                          ...current,
                          metadataJson: event.target.value,
                        }));
                      }}
                      value={formState.metadataJson}
                    />
                  </Form.Item>
                </div>
              </Form>

              {canEdit ? (
                <Space>
                  <Button
                    aria-label="保存样品"
                    disabled={!hasDirtyFields || Boolean(metadataJsonError)}
                    loading={saveMutation.isPending}
                    onClick={() => {
                      if (autosaveTimerRef.current) {
                        window.clearTimeout(autosaveTimerRef.current);
                      }
                      setMessage(null);
                      saveMutation.mutate();
                    }}
                    type="primary"
                  >
                    保存样品
                  </Button>
                  {saveMutation.isPending ? null : (
                    <Typography.Text type="secondary">
                      {hasDirtyFields ? "有未保存的修改" : "修改后自动保存"}
                    </Typography.Text>
                  )}
                </Space>
              ) : null}
            </>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="content-stack">
          <Typography.Title level={4} style={{ margin: 0 }}>
            关联文件
          </Typography.Title>
          {filesQuery.isLoading ? (
            <LoadingState />
          ) : filesQuery.isError ? (
            <Alert
              message={resolveErrorMessage(filesQuery.error, "样品文件加载失败")}
              showIcon
              type="error"
            />
          ) : fileRows.length === 0 ? (
            <EmptyState description="当前样品还没有关联文件。上传文件时选择该样品后会显示在这里。" />
          ) : (
            <Table<FileAssetRead>
              dataSource={fileRows}
              pagination={{ pageSize: 10, showSizeChanger: true }}
              rowKey="id"
              columns={[
                {
                  dataIndex: "original_name",
                  key: "original_name",
                  title: "文件名",
                  sorter: (a, b) => a.original_name.localeCompare(b.original_name),
                },
                {
                  dataIndex: "method",
                  key: "method",
                  title: "方法",
                  sorter: (a, b) => (a.method ?? "").localeCompare(b.method ?? ""),
                },
                {
                  dataIndex: "file_category",
                  key: "file_category",
                  title: "类别",
                  sorter: (a, b) => a.file_category.localeCompare(b.file_category),
                },
                {
                  dataIndex: "size_bytes",
                  key: "size_bytes",
                  title: "大小",
                  sorter: (a, b) => a.size_bytes - b.size_bytes,
                  render: (value: number) => formatBytes(value),
                },
                {
                  dataIndex: "created_at",
                  key: "created_at",
                  title: "上传时间",
                  defaultSortOrder: "descend",
                  sorter: (a, b) => a.created_at.localeCompare(b.created_at),
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
