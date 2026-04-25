import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from "antd";

import { HttpError } from "../../shared/api/http-error";
import { EmptyState } from "../../shared/ui/empty-state";
import { LoadingState } from "../../shared/ui/loading-state";
import { PageHeader } from "../../shared/ui/page-header";
import type {
  ControlledVocabularyCreateRequest,
  ControlledVocabularyRead,
  ControlledVocabularyUpdateRequest,
} from "../../shared/types/api";
import { useAuth } from "../auth/use-auth";
import { createVocabulary, listAdminVocabularies, updateVocabulary } from "./api";

type VocabularyFormState = {
  vocabKey: string;
  value: string;
  labelZh: string;
  labelEn: string;
  sortOrder: string;
  isActive: boolean;
  metadataJson: string;
};

const defaultCreateFormState: VocabularyFormState = {
  vocabKey: "",
  value: "",
  labelZh: "",
  labelEn: "",
  sortOrder: "0",
  isActive: true,
  metadataJson: "{}",
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

function normalizeOptionalText(value: string) {
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const objectEntries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${objectEntries
      .map(([key, itemValue]) => `${JSON.stringify(key)}:${stableSerialize(itemValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function parseMetadataJson(rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) {
    return {
      error: null,
      value: {},
    };
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        error: "元数据 JSON 必须是 JSON 对象",
        value: null,
      };
    }

    return {
      error: null,
      value: parsed as Record<string, unknown>,
    };
  } catch {
    return {
      error: "元数据 JSON 不是合法的 JSON 对象",
      value: null,
    };
  }
}

function buildCreatePayload(formState: VocabularyFormState) {
  const metadataResult = parseMetadataJson(formState.metadataJson);
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    };
  }

  const vocabKey = formState.vocabKey.trim();
  const value = formState.value.trim();
  const labelZh = formState.labelZh.trim();
  const sortOrder = Number(formState.sortOrder);

  if (!vocabKey || !value || !labelZh) {
    return {
      error: "请完整填写词表 key、值和中文标签",
      payload: null,
    };
  }

  if (!Number.isInteger(sortOrder)) {
    return {
      error: "排序必须是整数",
      payload: null,
    };
  }

  return {
    error: null,
    payload: {
      vocab_key: vocabKey,
      value,
      label_zh: labelZh,
      label_en: normalizeOptionalText(formState.labelEn),
      sort_order: sortOrder,
      is_active: formState.isActive,
      metadata_json: metadataResult.value ?? {},
    } satisfies ControlledVocabularyCreateRequest,
  };
}

function buildEditPayload(
  original: ControlledVocabularyRead,
  formState: VocabularyFormState,
) {
  const metadataResult = parseMetadataJson(formState.metadataJson);
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    };
  }

  const nextValue = formState.value.trim();
  const nextLabelZh = formState.labelZh.trim();
  const nextLabelEn = normalizeOptionalText(formState.labelEn);
  const nextSortOrder = Number(formState.sortOrder);

  if (!nextValue || !nextLabelZh) {
    return {
      error: "值和中文标签不能为空",
      payload: null,
    };
  }

  if (!Number.isInteger(nextSortOrder)) {
    return {
      error: "排序必须是整数",
      payload: null,
    };
  }

  const payload: ControlledVocabularyUpdateRequest = {};
  if (nextValue !== original.value) {
    payload.value = nextValue;
  }
  if (nextLabelZh !== original.label_zh) {
    payload.label_zh = nextLabelZh;
  }
  if (nextLabelEn !== original.label_en) {
    payload.label_en = nextLabelEn;
  }
  if (nextSortOrder !== original.sort_order) {
    payload.sort_order = nextSortOrder;
  }
  if (formState.isActive !== original.is_active) {
    payload.is_active = formState.isActive;
  }
  if (
    stableSerialize(metadataResult.value ?? {}) !== stableSerialize(original.metadata_json ?? {})
  ) {
    payload.metadata_json = metadataResult.value ?? {};
  }

  return {
    error: null,
    payload,
  };
}

function toFormState(item: ControlledVocabularyRead): VocabularyFormState {
  return {
    vocabKey: item.vocab_key,
    value: item.value,
    labelZh: item.label_zh,
    labelEn: item.label_en ?? "",
    sortOrder: String(item.sort_order),
    isActive: item.is_active,
    metadataJson: JSON.stringify(item.metadata_json ?? {}, null, 2),
  };
}

function CreateVocabularyForm({
  formState,
  onChange,
  onSubmit,
  loading,
}: {
  formState: VocabularyFormState;
  onChange: (next: VocabularyFormState) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const metadataError = parseMetadataJson(formState.metadataJson).error;

  return (
    <Form layout="vertical" requiredMark>
      <Form.Item htmlFor="vocabulary-create-key" label="词表 key" required>
        <Input
          id="vocabulary-create-key"
          onChange={(e) => onChange({ ...formState, vocabKey: e.target.value })}
          placeholder="例如 characterization_method"
          value={formState.vocabKey}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-create-value" label="值" required>
        <Input
          id="vocabulary-create-value"
          onChange={(e) => onChange({ ...formState, value: e.target.value })}
          placeholder="例如 raman"
          value={formState.value}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-create-label-zh" label="中文标签" required>
        <Input
          id="vocabulary-create-label-zh"
          onChange={(e) => onChange({ ...formState, labelZh: e.target.value })}
          placeholder="例如 拉曼光谱"
          value={formState.labelZh}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-create-label-en" label="英文标签">
        <Input
          id="vocabulary-create-label-en"
          onChange={(e) => onChange({ ...formState, labelEn: e.target.value })}
          placeholder="例如 Raman Spectroscopy"
          value={formState.labelEn}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-create-sort-order" label="排序" required>
        <InputNumber
          id="vocabulary-create-sort-order"
          min={0}
          onChange={(value) => onChange({ ...formState, sortOrder: String(value ?? 0) })}
          style={{ width: "100%" }}
          value={Number(formState.sortOrder)}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-create-enabled" label="启用">
        <Switch
          aria-label="启用"
          checked={formState.isActive}
          id="vocabulary-create-enabled"
          onChange={(checked) => onChange({ ...formState, isActive: checked })}
        />
      </Form.Item>
      <Form.Item
        htmlFor="vocabulary-create-metadata"
        label="元数据 JSON"
        validateStatus={metadataError ? "error" : undefined}
        help={metadataError}
      >
        <Input.TextArea
          autoSize={{ maxRows: 8, minRows: 4 }}
          id="vocabulary-create-metadata"
          onChange={(e) => onChange({ ...formState, metadataJson: e.target.value })}
          value={formState.metadataJson}
        />
      </Form.Item>
      <Button loading={loading} onClick={onSubmit} type="primary">
        创建词条
      </Button>
    </Form>
  );
}

function EditVocabularyForm({
  formState,
  onChange,
  onSubmit,
  loading,
}: {
  formState: VocabularyFormState;
  onChange: (next: VocabularyFormState) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const metadataError = parseMetadataJson(formState.metadataJson).error;

  return (
    <Form layout="vertical" requiredMark>
      <Form.Item htmlFor="vocabulary-edit-key" label="词表 key">
        <Input id="vocabulary-edit-key" readOnly value={formState.vocabKey} />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-edit-value" label="值" required>
        <Input
          id="vocabulary-edit-value"
          onChange={(e) => onChange({ ...formState, value: e.target.value })}
          value={formState.value}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-edit-label-zh" label="中文标签" required>
        <Input
          id="vocabulary-edit-label-zh"
          onChange={(e) => onChange({ ...formState, labelZh: e.target.value })}
          value={formState.labelZh}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-edit-label-en" label="英文标签">
        <Input
          id="vocabulary-edit-label-en"
          onChange={(e) => onChange({ ...formState, labelEn: e.target.value })}
          value={formState.labelEn}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-edit-sort-order" label="排序" required>
        <InputNumber
          id="vocabulary-edit-sort-order"
          min={0}
          onChange={(value) => onChange({ ...formState, sortOrder: String(value ?? 0) })}
          style={{ width: "100%" }}
          value={Number(formState.sortOrder)}
        />
      </Form.Item>
      <Form.Item htmlFor="vocabulary-edit-enabled" label="启用">
        <Switch
          aria-label="启用"
          checked={formState.isActive}
          id="vocabulary-edit-enabled"
          onChange={(checked) => onChange({ ...formState, isActive: checked })}
        />
      </Form.Item>
      <Form.Item
        htmlFor="vocabulary-edit-metadata"
        label="元数据 JSON"
        validateStatus={metadataError ? "error" : undefined}
        help={metadataError}
      >
        <Input.TextArea
          autoSize={{ maxRows: 8, minRows: 4 }}
          id="vocabulary-edit-metadata"
          onChange={(e) => onChange({ ...formState, metadataJson: e.target.value })}
          value={formState.metadataJson}
        />
      </Form.Item>
      <Button loading={loading} onClick={onSubmit} type="primary">
        保存修改
      </Button>
    </Form>
  );
}

export function VocabularyAdminPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const [appliedFilter, setAppliedFilter] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ControlledVocabularyRead | null>(null);
  const [createForm, setCreateForm] = useState(defaultCreateFormState);
  const [editForm, setEditForm] = useState<VocabularyFormState | null>(null);

  const isAdmin = currentUser?.role === "admin";
  const queryPrefix = ["admin", "vocabularies", currentUser?.id ?? "anonymous"];

  const vocabulariesQuery = useQuery({
    queryKey: [...queryPrefix, appliedFilter || "all"],
    queryFn: () => listAdminVocabularies(session.accessToken!, appliedFilter || null),
    enabled: session.isAuthenticated && isAdmin,
  });

  const vocabularyKeyOptionsQuery = useQuery({
    queryKey: [...queryPrefix, "key-options"],
    queryFn: () => listAdminVocabularies(session.accessToken!, null),
    enabled: session.isAuthenticated && isAdmin,
  });

  const uniqueKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of vocabularyKeyOptionsQuery.data?.items ?? vocabulariesQuery.data?.items ?? []) {
      keys.add(item.vocab_key);
    }
    return Array.from(keys).sort((left, right) => left.localeCompare(right));
  }, [vocabulariesQuery.data?.items, vocabularyKeyOptionsQuery.data?.items]);

  const filterOptions = useMemo(
    () => [
      { label: "全部", value: "" },
      ...uniqueKeys.map((key) => ({ label: key, value: key })),
    ],
    [uniqueKeys],
  );

  const invalidateVocabularyQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryPrefix,
      }),
      queryClient.invalidateQueries({
        queryKey: ["vocabularies"],
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: ControlledVocabularyCreateRequest) =>
      createVocabulary(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: "词条创建成功", type: "success" });
      setCreateOpen(false);
      setCreateForm(defaultCreateFormState);
      await invalidateVocabularyQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "词条创建失败"),
        type: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ vocabId, payload }: { payload: ControlledVocabularyUpdateRequest; vocabId: string }) =>
      updateVocabulary(session.accessToken!, vocabId, payload),
    onSuccess: async () => {
      setFeedback({ message: "词条更新成功", type: "success" });
      setEditTarget(null);
      setEditForm(null);
      await invalidateVocabularyQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "词条更新失败"),
        type: "error",
      });
    },
  });

  const handleCreateSubmit = () => {
    setFeedback(null);
    const result = buildCreatePayload(createForm);
    if (result.error || !result.payload) {
      setFeedback({
        message: result.error ?? "词条创建失败",
        type: "error",
      });
      return;
    }

    createMutation.mutate(result.payload);
  };

  const handleEditSubmit = () => {
    if (!editTarget || !editForm) {
      return;
    }

    setFeedback(null);
    const result = buildEditPayload(editTarget, editForm);
    if (result.error || !result.payload) {
      setFeedback({
        message: result.error ?? "词条更新失败",
        type: "error",
      });
      return;
    }

    updateMutation.mutate({ payload: result.payload, vocabId: editTarget.id });
  };

  if (!isAdmin) {
    return (
      <div className="content-stack">
        <PageHeader
          subtitle="受控词表管理仅对管理员开放。"
          title="受控词表"
        />
        <Alert message="当前账号没有词表管理权限。" showIcon type="warning" />
      </div>
    );
  }

  const rows = vocabulariesQuery.data?.items ?? [];

  return (
    <div className="content-stack">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setFeedback(null);
              setCreateForm(defaultCreateFormState);
              setCreateOpen(true);
            }}
            type="primary"
          >
            新增词条
          </Button>
        }
        subtitle="管理受控词表条目，词表变更会影响实验和文件页的候选项。"
        title="受控词表"
      />

      {feedback ? <Alert message={feedback.message} showIcon type={feedback.type} /> : null}

      <Card>
        <Space align="end" size={16} wrap>
          <Form.Item htmlFor="vocabulary-filter-key" label="词表 key 筛选" style={{ marginBottom: 0 }}>
            <Select
              aria-label="词表 key 筛选"
              allowClear
              id="vocabulary-filter-key"
              onChange={(value) => {
                setAppliedFilter(value ?? "");
              }}
              options={filterOptions}
              placeholder="选择或搜索词表 key"
              showSearch
              style={{ width: 260 }}
              value={appliedFilter || undefined}
              virtual={false}
            />
          </Form.Item>
          <Button
            onClick={() => {
              setAppliedFilter("");
            }}
          >
            清空筛选
          </Button>
        </Space>
      </Card>

      <Card>
        {vocabulariesQuery.isLoading ? (
          <LoadingState />
        ) : vocabulariesQuery.isError ? (
          <Alert
            message={resolveErrorMessage(vocabulariesQuery.error, "词表列表加载失败")}
            showIcon
            type="error"
          />
        ) : rows.length === 0 ? (
          <EmptyState description="当前筛选条件下还没有词条。可清空筛选或新增词条。" />
        ) : (
          <Table
            dataSource={rows}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            rowKey="id"
            columns={[
              {
                dataIndex: "vocab_key",
                key: "vocab_key",
                title: "词表 key",
              },
              {
                dataIndex: "value",
                key: "value",
                title: "值",
              },
              {
                dataIndex: "label_zh",
                key: "label_zh",
                title: "中文标签",
              },
              {
                dataIndex: "label_en",
                key: "label_en",
                render: (value: string | null) => value || "-",
                title: "英文标签",
              },
              {
                dataIndex: "sort_order",
                key: "sort_order",
                title: "排序",
              },
              {
                dataIndex: "is_active",
                key: "is_active",
                render: (value: boolean) =>
                  value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
                title: "状态",
              },
              {
                dataIndex: "metadata_json",
                key: "metadata_json",
                render: (value: Record<string, unknown>) =>
                  Object.keys(value ?? {}).length > 0 ? (
                    <Typography.Text code>{JSON.stringify(value)}</Typography.Text>
                  ) : (
                    "-"
                  ),
                title: "元数据",
              },
              {
                key: "actions",
                render: (_value: unknown, record: ControlledVocabularyRead) => (
                  <Space wrap>
                    <Button
                      aria-label={`编辑 ${record.vocab_key}:${record.value}`}
                      onClick={() => {
                        setFeedback(null);
                        setEditTarget(record);
                        setEditForm(toFormState(record));
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      aria-label={`${record.is_active ? "停用" : "启用"} ${record.vocab_key}:${record.value}`}
                      loading={updateMutation.isPending && updateMutation.variables?.vocabId === record.id}
                      onClick={() => {
                        setFeedback(null);
                        updateMutation.mutate({
                          payload: { is_active: !record.is_active },
                          vocabId: record.id,
                        });
                      }}
                    >
                      {record.is_active ? "停用" : "启用"}
                    </Button>
                  </Space>
                ),
                title: "操作",
              },
            ]}
          />
        )}
      </Card>

      <Modal
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setCreateOpen(false);
        }}
        open={createOpen}
        title="新增词条"
      >
        <CreateVocabularyForm
          formState={createForm}
          loading={createMutation.isPending}
          onChange={setCreateForm}
          onSubmit={handleCreateSubmit}
        />
      </Modal>

      <Modal
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setEditTarget(null);
          setEditForm(null);
        }}
        open={editTarget !== null && editForm !== null}
        title={editTarget ? `编辑词条 · ${editTarget.vocab_key}` : "编辑词条"}
      >
        {editTarget && editForm ? (
          <EditVocabularyForm
            formState={editForm}
            loading={updateMutation.isPending}
            onChange={setEditForm}
            onSubmit={handleEditSubmit}
          />
        ) : null}
      </Modal>
    </div>
  );
}
