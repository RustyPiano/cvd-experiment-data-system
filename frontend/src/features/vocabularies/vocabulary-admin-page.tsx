import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from "antd";

import { HttpError } from "../../shared/api/http-error";
import { EmptyState } from "../../shared/ui/empty-state";
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

export function VocabularyAdminPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const [filterInput, setFilterInput] = useState("");
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

  const uniqueKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const item of vocabulariesQuery.data?.items ?? []) {
      keys.add(item.vocab_key);
    }
    return Array.from(keys).sort((left, right) => left.localeCompare(right));
  }, [vocabulariesQuery.data?.items]);

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
          subtitle="当前页面只开放给 admin，用于维护实验录入依赖的受控词表。"
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
        subtitle="当前后台提供列表筛选、创建、编辑与启停用；编辑会直接影响实验页和文件页的候选词。"
        title="受控词表"
      />

      {feedback ? <Alert message={feedback.message} showIcon type={feedback.type} /> : null}

      <Card>
        <Space align="end" size={16} wrap>
          <div>
            <label htmlFor="vocabulary-filter-key">词表 key 筛选</label>
            <Input
              id="vocabulary-filter-key"
              list="vocabulary-key-options"
              onChange={(event) => {
                setFilterInput(event.target.value);
              }}
              placeholder="例如 characterization_method"
              style={{ width: 260 }}
              value={filterInput}
            />
            <datalist id="vocabulary-key-options">
              {uniqueKeys.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
          </div>
          <Button
            onClick={() => {
              setAppliedFilter(filterInput.trim());
            }}
          >
            应用筛选
          </Button>
          <Button
            onClick={() => {
              setFilterInput("");
              setAppliedFilter("");
            }}
          >
            清空筛选
          </Button>
        </Space>
      </Card>

      <Card>
        {vocabulariesQuery.isLoading ? (
          <div className="centered-panel">
            <Spin />
          </div>
        ) : vocabulariesQuery.isError ? (
          <Alert
            message={resolveErrorMessage(vocabulariesQuery.error, "词表列表加载失败")}
            showIcon
            type="error"
          />
        ) : rows.length === 0 ? (
          <EmptyState description="当前筛选条件下还没有词条。" />
        ) : (
          <Table
            dataSource={rows}
            pagination={false}
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
        <Space orientation="vertical" size={16} style={{ width: "100%" }}>
          <div>
            <label htmlFor="vocabulary-create-key">词表 key</label>
            <Input
              id="vocabulary-create-key"
              onChange={(event) => {
                setCreateForm((current) => ({ ...current, vocabKey: event.target.value }));
              }}
              value={createForm.vocabKey}
            />
          </div>
          <div>
            <label htmlFor="vocabulary-create-value">值</label>
            <Input
              id="vocabulary-create-value"
              onChange={(event) => {
                setCreateForm((current) => ({ ...current, value: event.target.value }));
              }}
              value={createForm.value}
            />
          </div>
          <div>
            <label htmlFor="vocabulary-create-label-zh">中文标签</label>
            <Input
              id="vocabulary-create-label-zh"
              onChange={(event) => {
                setCreateForm((current) => ({ ...current, labelZh: event.target.value }));
              }}
              value={createForm.labelZh}
            />
          </div>
          <div>
            <label htmlFor="vocabulary-create-label-en">英文标签</label>
            <Input
              id="vocabulary-create-label-en"
              onChange={(event) => {
                setCreateForm((current) => ({ ...current, labelEn: event.target.value }));
              }}
              value={createForm.labelEn}
            />
          </div>
          <div>
            <label htmlFor="vocabulary-create-sort-order">排序</label>
            <Input
              id="vocabulary-create-sort-order"
              inputMode="numeric"
              onChange={(event) => {
                setCreateForm((current) => ({ ...current, sortOrder: event.target.value }));
              }}
              value={createForm.sortOrder}
            />
          </div>
          <div>
            <label htmlFor="vocabulary-create-enabled">启用</label>
            <input
              checked={createForm.isActive}
              id="vocabulary-create-enabled"
              onChange={(event) => {
                setCreateForm((current) => ({ ...current, isActive: event.target.checked }));
              }}
              type="checkbox"
            />
          </div>
          <div>
            <label htmlFor="vocabulary-create-metadata">元数据 JSON</label>
            <Input.TextArea
              id="vocabulary-create-metadata"
              autoSize={{ maxRows: 8, minRows: 4 }}
              onChange={(event) => {
                setCreateForm((current) => ({ ...current, metadataJson: event.target.value }));
              }}
              value={createForm.metadataJson}
            />
          </div>
          <Button
            loading={createMutation.isPending}
            onClick={handleCreateSubmit}
            type="primary"
          >
            创建词条
          </Button>
        </Space>
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
          <Space orientation="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <label htmlFor="vocabulary-edit-key">词表 key</label>
              <Input id="vocabulary-edit-key" readOnly value={editForm.vocabKey} />
            </div>
            <div>
              <label htmlFor="vocabulary-edit-value">值</label>
              <Input
                id="vocabulary-edit-value"
                onChange={(event) => {
                  setEditForm((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  );
                }}
                value={editForm.value}
              />
            </div>
            <div>
              <label htmlFor="vocabulary-edit-label-zh">中文标签</label>
              <Input
                id="vocabulary-edit-label-zh"
                onChange={(event) => {
                  setEditForm((current) =>
                    current ? { ...current, labelZh: event.target.value } : current,
                  );
                }}
                value={editForm.labelZh}
              />
            </div>
            <div>
              <label htmlFor="vocabulary-edit-label-en">英文标签</label>
              <Input
                id="vocabulary-edit-label-en"
                onChange={(event) => {
                  setEditForm((current) =>
                    current ? { ...current, labelEn: event.target.value } : current,
                  );
                }}
                value={editForm.labelEn}
              />
            </div>
            <div>
              <label htmlFor="vocabulary-edit-sort-order">排序</label>
              <Input
                id="vocabulary-edit-sort-order"
                inputMode="numeric"
                onChange={(event) => {
                  setEditForm((current) =>
                    current ? { ...current, sortOrder: event.target.value } : current,
                  );
                }}
                value={editForm.sortOrder}
              />
            </div>
            <div>
              <label htmlFor="vocabulary-edit-enabled">启用</label>
              <input
                checked={editForm.isActive}
                id="vocabulary-edit-enabled"
                onChange={(event) => {
                  setEditForm((current) =>
                    current ? { ...current, isActive: event.target.checked } : current,
                  );
                }}
                role="switch"
                type="checkbox"
              />
            </div>
            <div>
              <label htmlFor="vocabulary-edit-metadata">元数据 JSON</label>
              <Input.TextArea
                id="vocabulary-edit-metadata"
                autoSize={{ maxRows: 8, minRows: 4 }}
                onChange={(event) => {
                  setEditForm((current) =>
                    current ? { ...current, metadataJson: event.target.value } : current,
                  );
                }}
                value={editForm.metadataJson}
              />
            </div>
            <Button
              loading={updateMutation.isPending}
              onClick={handleEditSubmit}
              type="primary"
            >
              保存修改
            </Button>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
}
