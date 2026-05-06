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
import type {
  FieldDefinitionCreateRequest,
  FieldDefinitionRead,
  FieldDefinitionUpdateRequest,
  FieldType,
} from "../../shared/types/api";
import { EmptyState } from "../../shared/ui/empty-state";
import { LoadingState } from "../../shared/ui/loading-state";
import { PageHeader } from "../../shared/ui/page-header";
import { useAuth } from "../auth/use-auth";
import { listActiveVocabularies } from "../experiments/api";
import {
  createFieldDefinition,
  deactivateFieldDefinition,
  listAdminFieldDefinitions,
  reactivateFieldDefinition,
  updateFieldDefinition,
} from "./api";

const MODULE_LABELS: Record<string, string> = {
  basic_info: "基本信息",
  environment: "环境",
  precheck: "预检",
  precursors: "前驱体",
  substrates: "基底",
  furnace_program: "温区程序",
  gas_program: "气体程序",
  process_observation: "过程观察",
  characterization: "表征",
  result_summary: "结果摘要",
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "文本",
  number: "数字",
  boolean: "布尔",
  select: "下拉选择",
  textarea: "长文本",
  date: "日期",
  multi_select: "多选",
  array: "数组",
};

const FIELD_TYPE_OPTIONS = Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const MODULE_OPTIONS = Object.entries(MODULE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const DEFAULT_STRATEGY_OPTIONS = [
  { value: "empty", label: "空" },
  { value: "inherit", label: "继承" },
  { value: "default", label: "默认值" },
];

type FieldDefinitionFormState = {
  fieldKey: string;
  moduleKey: string;
  labelZh: string;
  labelEn: string;
  fieldType: FieldType;
  unit: string;
  required: boolean;
  defaultStrategy: string;
  inheritable: boolean;
  vocabKey: string;
  sortOrder: number;
  isActive: boolean;
  metadataJson: string;
};

const defaultCreateFormState: FieldDefinitionFormState = {
  fieldKey: "",
  moduleKey: "basic_info",
  labelZh: "",
  labelEn: "",
  fieldType: "text",
  unit: "",
  required: false,
  defaultStrategy: "",
  inheritable: false,
  vocabKey: "",
  sortOrder: 0,
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

function buildCreatePayload(formState: FieldDefinitionFormState) {
  const metadataResult = parseMetadataJson(formState.metadataJson);
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    } as const;
  }

  const fieldKey = formState.fieldKey.trim();
  const moduleKey = formState.moduleKey.trim();
  const labelZh = formState.labelZh.trim();

  if (!fieldKey || !moduleKey || !labelZh) {
    return {
      error: "请完整填写字段 key、模块 key 和中文名",
      payload: null,
    } as const;
  }

  const payload: FieldDefinitionCreateRequest = {
    field_key: fieldKey,
    module_key: moduleKey,
    label_zh: labelZh,
    label_en: normalizeOptionalText(formState.labelEn),
    field_type: formState.fieldType,
    unit: normalizeOptionalText(formState.unit),
    required: formState.required,
    default_strategy: normalizeOptionalText(formState.defaultStrategy),
    inheritable: formState.inheritable,
    vocab_key: normalizeOptionalText(formState.vocabKey),
    sort_order: formState.sortOrder,
    is_active: formState.isActive,
    metadata_json: metadataResult.value ?? {},
  };

  return {
    error: null,
    payload,
  } as const;
}

function buildEditPayload(
  original: FieldDefinitionRead,
  formState: FieldDefinitionFormState,
) {
  const metadataResult = parseMetadataJson(formState.metadataJson);
  if (metadataResult.error) {
    return {
      error: metadataResult.error,
      payload: null,
    } as const;
  }

  const nextFieldKey = formState.fieldKey.trim();
  const nextModuleKey = formState.moduleKey.trim();
  const nextLabelZh = formState.labelZh.trim();

  if (!nextFieldKey || !nextModuleKey || !nextLabelZh) {
    return {
      error: "字段 key、模块 key 和中文名不能为空",
      payload: null,
    } as const;
  }

  const payload: FieldDefinitionUpdateRequest = {};

  if (nextFieldKey !== original.field_key) {
    payload.field_key = nextFieldKey;
  }
  if (nextModuleKey !== original.module_key) {
    payload.module_key = nextModuleKey;
  }
  if (nextLabelZh !== original.label_zh) {
    payload.label_zh = nextLabelZh;
  }

  const nextLabelEn = normalizeOptionalText(formState.labelEn);
  if (nextLabelEn !== original.label_en) {
    payload.label_en = nextLabelEn;
  }
  if (formState.fieldType !== original.field_type) {
    payload.field_type = formState.fieldType;
  }

  const nextUnit = normalizeOptionalText(formState.unit);
  if (nextUnit !== original.unit) {
    payload.unit = nextUnit;
  }
  if (formState.required !== original.required) {
    payload.required = formState.required;
  }

  const nextDefaultStrategy = normalizeOptionalText(formState.defaultStrategy);
  if (nextDefaultStrategy !== original.default_strategy) {
    payload.default_strategy = nextDefaultStrategy;
  }
  if (formState.inheritable !== original.inheritable) {
    payload.inheritable = formState.inheritable;
  }

  const nextVocabKey = normalizeOptionalText(formState.vocabKey);
  if (nextVocabKey !== original.vocab_key) {
    payload.vocab_key = nextVocabKey;
  }
  if (formState.sortOrder !== original.sort_order) {
    payload.sort_order = formState.sortOrder;
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
  } as const;
}

function toFormState(item: FieldDefinitionRead): FieldDefinitionFormState {
  return {
    fieldKey: item.field_key,
    moduleKey: item.module_key,
    labelZh: item.label_zh,
    labelEn: item.label_en ?? "",
    fieldType: item.field_type,
    unit: item.unit ?? "",
    required: item.required,
    defaultStrategy: item.default_strategy ?? "",
    inheritable: item.inheritable,
    vocabKey: item.vocab_key ?? "",
    sortOrder: item.sort_order,
    isActive: item.is_active,
    metadataJson: JSON.stringify(item.metadata_json ?? {}, null, 2),
  };
}

function FieldDefinitionForm({
  formState,
  loading,
  materialOptions,
  onChange,
  onSubmit,
  submitText,
  isEdit,
}: {
  formState: FieldDefinitionFormState;
  loading: boolean;
  materialOptions: { label: string; value: string }[];
  onChange: (next: FieldDefinitionFormState) => void;
  onSubmit: () => void;
  submitText: string;
  isEdit: boolean;
}) {
  const metadataError = parseMetadataJson(formState.metadataJson).error;

  return (
    <Form layout="vertical" requiredMark>
      <Form.Item htmlFor="field-def-key" label="字段 key" required>
        <Input
          id="field-def-key"
          onChange={(e) => onChange({ ...formState, fieldKey: e.target.value })}
          placeholder="例如 temperature"
          readOnly={isEdit}
          style={isEdit ? { color: "rgba(0,0,0,0.45)" } : undefined}
          value={formState.fieldKey}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-module" label="模块 key" required>
        <Select
          aria-label="模块 key"
          disabled={isEdit}
          id="field-def-module"
          onChange={(value) => onChange({ ...formState, moduleKey: value })}
          options={MODULE_OPTIONS}
          placeholder="选择模块"
          style={isEdit ? { pointerEvents: "none" } : undefined}
          value={formState.moduleKey}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-label-zh" label="中文名" required>
        <Input
          id="field-def-label-zh"
          onChange={(e) => onChange({ ...formState, labelZh: e.target.value })}
          placeholder="例如 温度"
          value={formState.labelZh}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-label-en" label="英文名">
        <Input
          id="field-def-label-en"
          onChange={(e) => onChange({ ...formState, labelEn: e.target.value })}
          placeholder="例如 Temperature"
          value={formState.labelEn}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-type" label="字段类型" required>
        <Select
          aria-label="字段类型"
          id="field-def-type"
          onChange={(value) => onChange({ ...formState, fieldType: value as FieldType })}
          options={FIELD_TYPE_OPTIONS}
          value={formState.fieldType}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-unit" label="单位">
        <Input
          id="field-def-unit"
          onChange={(e) => onChange({ ...formState, unit: e.target.value })}
          placeholder="例如 °C、sccm、mg"
          value={formState.unit}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-required" label="必填">
        <Switch
          aria-label="必填"
          checked={formState.required}
          id="field-def-required"
          onChange={(checked) => onChange({ ...formState, required: checked })}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-strategy" label="默认策略">
        <Select
          allowClear
          aria-label="默认策略"
          id="field-def-strategy"
          onChange={(value) => onChange({ ...formState, defaultStrategy: value ?? "" })}
          options={DEFAULT_STRATEGY_OPTIONS}
          placeholder="选择默认策略"
          value={formState.defaultStrategy || undefined}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-inheritable" label="可继承">
        <Switch
          aria-label="可继承"
          checked={formState.inheritable}
          id="field-def-inheritable"
          onChange={(checked) => onChange({ ...formState, inheritable: checked })}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-vocab" label="关联词表">
        <Select
          allowClear
          aria-label="关联词表"
          id="field-def-vocab"
          onChange={(value) => onChange({ ...formState, vocabKey: value ?? "" })}
          options={materialOptions}
          placeholder="选择关联词表"
          showSearch
          value={formState.vocabKey || undefined}
          virtual={false}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-sort" label="排序" required>
        <InputNumber
          id="field-def-sort"
          min={0}
          onChange={(value) => onChange({ ...formState, sortOrder: value ?? 0 })}
          style={{ width: "100%" }}
          value={formState.sortOrder}
        />
      </Form.Item>
      <Form.Item htmlFor="field-def-active" label="启用">
        <Switch
          aria-label="启用"
          checked={formState.isActive}
          id="field-def-active"
          onChange={(checked) => onChange({ ...formState, isActive: checked })}
        />
      </Form.Item>
      <Form.Item
        htmlFor="field-def-metadata"
        label="元数据 JSON"
        validateStatus={metadataError ? "error" : undefined}
        help={metadataError}
      >
        <Input.TextArea
          autoSize={{ maxRows: 8, minRows: 4 }}
          id="field-def-metadata"
          onChange={(e) => onChange({ ...formState, metadataJson: e.target.value })}
          value={formState.metadataJson}
        />
      </Form.Item>
      <Button loading={loading} onClick={onSubmit} type="primary">
        {submitText}
      </Button>
    </Form>
  );
}

export function FieldDefinitionAdminPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const [appliedFilter, setAppliedFilter] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<FieldDefinitionRead | null>(null);
  const [createForm, setCreateForm] = useState(defaultCreateFormState);
  const [editForm, setEditForm] = useState<FieldDefinitionFormState | null>(null);

  const isAdmin = currentUser?.role === "admin";
  const queryPrefix = ["admin", "field-definitions", currentUser?.id ?? "anonymous"];

  const fieldDefinitionsQuery = useQuery({
    queryKey: [...queryPrefix, appliedFilter || "all"],
    queryFn: () => listAdminFieldDefinitions(session.accessToken!, appliedFilter || undefined),
    enabled: session.isAuthenticated && isAdmin,
  });

  const vocabularyKeysQuery = useQuery({
    queryKey: ["vocabularies", "all-keys", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, ""),
    enabled: session.isAuthenticated && isAdmin,
  });

  const vocabKeyOptions = useMemo(() => {
    const keys = new Set<string>();
    for (const item of vocabularyKeysQuery.data?.items ?? []) {
      keys.add(item.vocab_key);
    }
    return Array.from(keys)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({ label: key, value: key }));
  }, [vocabularyKeysQuery.data?.items]);

  const invalidateFieldDefinitionQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryPrefix,
      }),
      queryClient.invalidateQueries({
        queryKey: ["field-definitions"],
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: FieldDefinitionCreateRequest) =>
      createFieldDefinition(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: "字段定义创建成功", type: "success" });
      setCreateOpen(false);
      setCreateForm(defaultCreateFormState);
      await invalidateFieldDefinitionQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "字段定义创建失败"),
        type: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      fieldId,
      payload,
    }: { payload: FieldDefinitionUpdateRequest; fieldId: string }) =>
      updateFieldDefinition(session.accessToken!, fieldId, payload),
    onSuccess: async () => {
      setFeedback({ message: "字段定义更新成功", type: "success" });
      setEditTarget(null);
      setEditForm(null);
      await invalidateFieldDefinitionQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "字段定义更新失败"),
        type: "error",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (fieldId: string) =>
      deactivateFieldDefinition(session.accessToken!, fieldId),
    onSuccess: async () => {
      setFeedback({ message: "字段定义已停用", type: "success" });
      await invalidateFieldDefinitionQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "字段定义停用失败"),
        type: "error",
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (fieldId: string) =>
      reactivateFieldDefinition(session.accessToken!, fieldId),
    onSuccess: async () => {
      setFeedback({ message: "字段定义已重新启用", type: "success" });
      await invalidateFieldDefinitionQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "字段定义重新启用失败"),
        type: "error",
      });
    },
  });

  const handleCreateSubmit = () => {
    setFeedback(null);
    const result = buildCreatePayload(createForm);
    if (result.error || !result.payload) {
      setFeedback({
        message: result.error ?? "字段定义创建失败",
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
        message: result.error ?? "字段定义更新失败",
        type: "error",
      });
      return;
    }

    updateMutation.mutate({ payload: result.payload, fieldId: editTarget.id });
  };

  if (!isAdmin) {
    return (
      <div className="content-stack">
        <PageHeader
          subtitle="字段词典管理仅对管理员开放。"
          title="字段词典"
        />
        <Alert message="当前账号没有字段词典管理权限。" showIcon type="warning" />
      </div>
    );
  }

  const rows = fieldDefinitionsQuery.data?.items ?? [];

  const filterOptions = [
    { label: "全部", value: "" },
    ...MODULE_OPTIONS,
  ];

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
            新增字段
          </Button>
        }
        subtitle="管理字段词典定义，控制实验表单的字段、类型和约束。"
        title="字段词典"
      />

      {feedback ? <Alert message={feedback.message} showIcon type={feedback.type} /> : null}

      <Card>
        <Space align="end" size={16} wrap>
          <Form.Item htmlFor="field-def-filter-module" label="模块筛选" style={{ marginBottom: 0 }}>
            <Select
              aria-label="模块筛选"
              allowClear
              id="field-def-filter-module"
              onChange={(value) => {
                setAppliedFilter(value ?? "");
              }}
              options={filterOptions}
              placeholder="选择模块"
              showSearch
              style={{ width: 200 }}
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
        {fieldDefinitionsQuery.isLoading ? (
          <LoadingState />
        ) : fieldDefinitionsQuery.isError ? (
          <Alert
            message={resolveErrorMessage(fieldDefinitionsQuery.error, "字段定义列表加载失败")}
            showIcon
            type="error"
          />
        ) : rows.length === 0 ? (
          <EmptyState description="当前筛选条件下还没有字段定义。可清空筛选或新增字段。" />
        ) : (
          <Table
            columns={[
              {
                dataIndex: "field_key",
                key: "field_key",
                render: (value: string) => (
                  <Typography.Text code>{value}</Typography.Text>
                ),
                title: "字段 key",
              },
              {
                dataIndex: "label_zh",
                key: "label_zh",
                title: "中文名",
              },
              {
                dataIndex: "field_type",
                key: "field_type",
                render: (value: FieldType) => FIELD_TYPE_LABELS[value] ?? value,
                title: "类型",
              },
              {
                dataIndex: "unit",
                key: "unit",
                render: (value: string | null) => value || "-",
                title: "单位",
              },
              {
                dataIndex: "required",
                key: "required",
                render: (value: boolean) =>
                  value ? <Tag color="red">必填</Tag> : <Tag>选填</Tag>,
                title: "必填",
              },
              {
                dataIndex: "inheritable",
                key: "inheritable",
                render: (value: boolean) =>
                  value ? <Tag color="blue">可继承</Tag> : "-",
                title: "可继承",
              },
              {
                dataIndex: "vocab_key",
                key: "vocab_key",
                render: (value: string | null) => value || "-",
                title: "词表",
              },
              {
                dataIndex: "is_active",
                key: "is_active",
                render: (value: boolean) =>
                  value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>,
                title: "状态",
              },
              {
                key: "actions",
                render: (_value: unknown, record: FieldDefinitionRead) => (
                  <Space wrap>
                    <Button
                      aria-label={`编辑 ${record.field_key}`}
                      onClick={() => {
                        setFeedback(null);
                        setEditTarget(record);
                        setEditForm(toFormState(record));
                      }}
                    >
                      编辑
                    </Button>
                    {record.is_active ? (
                      <Button
                        aria-label={`停用 ${record.field_key}`}
                        loading={
                          deactivateMutation.isPending &&
                          deactivateMutation.variables === record.id
                        }
                        onClick={() => {
                          setFeedback(null);
                          deactivateMutation.mutate(record.id);
                        }}
                      >
                        停用
                      </Button>
                    ) : (
                      <Button
                        aria-label={`启用 ${record.field_key}`}
                        loading={
                          reactivateMutation.isPending &&
                          reactivateMutation.variables === record.id
                        }
                        onClick={() => {
                          setFeedback(null);
                          reactivateMutation.mutate(record.id);
                        }}
                      >
                        启用
                      </Button>
                    )}
                  </Space>
                ),
                title: "操作",
              },
            ]}
            dataSource={rows}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            rowKey="id"
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
        title="新增字段定义"
      >
        <FieldDefinitionForm
          formState={createForm}
          isEdit={false}
          loading={createMutation.isPending}
          materialOptions={vocabKeyOptions}
          onChange={setCreateForm}
          onSubmit={handleCreateSubmit}
          submitText="创建字段定义"
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
        title={editTarget ? `编辑字段定义 · ${editTarget.field_key}` : "编辑字段定义"}
      >
        {editTarget && editForm ? (
          <FieldDefinitionForm
            formState={editForm}
            isEdit={true}
            loading={updateMutation.isPending}
            materialOptions={vocabKeyOptions}
            onChange={setEditForm}
            onSubmit={handleEditSubmit}
            submitText="保存修改"
          />
        ) : null}
      </Modal>
    </div>
  );
}