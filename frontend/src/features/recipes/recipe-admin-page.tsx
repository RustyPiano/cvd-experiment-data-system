import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from "antd";

import { HttpError } from "../../shared/api/http-error";
import type {
  ExperimentRead,
  RecipeCreateRequest,
  RecipeRead,
  RecipeUpdateRequest,
} from "../../shared/types/api";
import { EmptyState } from "../../shared/ui/empty-state";
import { LoadingState } from "../../shared/ui/loading-state";
import { PageHeader } from "../../shared/ui/page-header";
import { useAuth } from "../auth/use-auth";
import { listExperimentModules, listExperiments, listActiveVocabularies } from "../experiments/api";
import { VocabularyCombobox } from "../experiments/components/vocabulary-combobox";
import type { VocabularySelectOption } from "../experiments/editor-types";
import {
  createRecipe,
  deactivateRecipe,
  listAdminRecipes,
  updateRecipe,
} from "./api";
import { RecipePayloadEditor } from "./recipe-payload-editor";

type RecipeFormState = {
  name: string;
  materialSystem: string;
  description: string;
  defaultPayloadJson: Record<string, unknown>;
};

const defaultCreateFormState: RecipeFormState = {
  name: "",
  materialSystem: "",
  description: "",
  defaultPayloadJson: {},
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

function buildCreatePayload(formState: RecipeFormState) {
  const name = formState.name.trim();
  if (!name) {
    return {
      error: "请填写 Recipe 名称",
      payload: null,
    };
  }

  const payload: RecipeCreateRequest = {
    name,
    default_payload_json: formState.defaultPayloadJson,
  };
  const materialSystem = normalizeOptionalText(formState.materialSystem);
  const description = normalizeOptionalText(formState.description);
  if (materialSystem) {
    payload.material_system = materialSystem;
  }
  if (description) {
    payload.description = description;
  }

  return {
    error: null,
    payload,
  };
}

function buildEditPayload(original: RecipeRead, formState: RecipeFormState) {
  const nextName = formState.name.trim();
  if (!nextName) {
    return {
      error: "Recipe 名称不能为空",
      payload: null,
    };
  }

  const nextMaterialSystem = normalizeOptionalText(formState.materialSystem);
  const nextDescription = normalizeOptionalText(formState.description);
  const payload: RecipeUpdateRequest = {};

  if (nextName !== original.name) {
    payload.name = nextName;
  }
  if (nextMaterialSystem !== (original.material_system ?? "")) {
    payload.material_system = nextMaterialSystem;
  }
  if (nextDescription !== (original.description ?? "")) {
    payload.description = nextDescription;
  }

  const originalPayload = original.default_payload_json ?? {};
  if (JSON.stringify(formState.defaultPayloadJson) !== JSON.stringify(originalPayload)) {
    payload.default_payload_json = formState.defaultPayloadJson;
  }

  return {
    error: null,
    payload,
  };
}

function toFormState(recipe: RecipeRead): RecipeFormState {
  return {
    name: recipe.name,
    materialSystem: recipe.material_system ?? "",
    description: recipe.description ?? "",
    defaultPayloadJson: recipe.default_payload_json ?? {},
  };
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const RECIPE_MODULE_KEYS = new Set([
  "precursors",
  "substrates",
  "furnace_program",
  "gas_program",
  "characterization",
]);

function sanitizeModulePayload(
  moduleKey: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (moduleKey === "precursors") {
    const items = payload.items;
    if (!Array.isArray(items)) return payload;
    return {
      ...payload,
      items: items
        .filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object" && !Array.isArray(item),
        )
        .map((item) => {
          const { batch_no, mass_mg, ...rest } = item;
          void batch_no;
          void mass_mg;
          return rest;
        }),
    };
  }
  return payload;
}

function RecipeForm({
  formState,
  loading,
  materialOptions,
  materialSystemAriaLabel,
  vocabularyOptions,
  onChange,
  onSubmit,
  submitText,
  onImportFromExperiment,
}: {
  formState: RecipeFormState;
  loading: boolean;
  materialOptions: VocabularySelectOption[];
  materialSystemAriaLabel: string;
  vocabularyOptions: Record<string, VocabularySelectOption[]>;
  onChange: (next: RecipeFormState) => void;
  onSubmit: () => void;
  submitText: string;
  onImportFromExperiment?: () => void;
}) {
  return (
    <Form layout="vertical" requiredMark>
      <Form.Item htmlFor="recipe-name" label="名称" required>
        <Input
          id="recipe-name"
          onChange={(e) => onChange({ ...formState, name: e.target.value })}
          placeholder="例如 MoS2 baseline"
          value={formState.name}
        />
      </Form.Item>
      <Form.Item label="材料体系">
        <VocabularyCombobox
          ariaLabel={materialSystemAriaLabel}
          disabled={false}
          onChange={(value) => onChange({ ...formState, materialSystem: value })}
          options={materialOptions}
          placeholder="选择或输入材料体系"
          value={formState.materialSystem}
        />
      </Form.Item>
      <Form.Item htmlFor="recipe-description" label="描述">
        <Input.TextArea
          autoSize={{ maxRows: 4, minRows: 2 }}
          id="recipe-description"
          onChange={(e) => onChange({ ...formState, description: e.target.value })}
          value={formState.description}
        />
      </Form.Item>
      {onImportFromExperiment ? (
        <Space style={{ marginBottom: 8 }}>
          <span style={{ fontWeight: 500 }}>默认参数</span>
          <Button onClick={onImportFromExperiment} size="small" type="link">
            从实验导入
          </Button>
        </Space>
      ) : (
        <span style={{ fontWeight: 500, marginBottom: 8, display: "block" }}>
          默认参数
        </span>
      )}
      <RecipePayloadEditor
        value={formState.defaultPayloadJson}
        onChange={(next) => onChange({ ...formState, defaultPayloadJson: next })}
        vocabularyOptions={vocabularyOptions}
      />
      <Button
        htmlType="submit"
        loading={loading}
        onClick={onSubmit}
        style={{ marginTop: 16 }}
        type="primary"
      >
        {submitText}
      </Button>
    </Form>
  );
}

export function RecipeAdminPage() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const currentUser = session.currentUser;
  const [appliedFilter, setAppliedFilter] = useState("");
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(
    null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecipeRead | null>(null);
  const [createForm, setCreateForm] = useState(defaultCreateFormState);
  const [editForm, setEditForm] = useState<RecipeFormState | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importSearch, setImportSearch] = useState("");

  const isAdmin = currentUser?.role === "admin";
  const queryPrefix = ["admin", "recipes", currentUser?.id ?? "anonymous"];

  const recipesQuery = useQuery({
    queryKey: [...queryPrefix, appliedFilter || "all"],
    queryFn: () => listAdminRecipes(session.accessToken!, appliedFilter || undefined),
    enabled: session.isAuthenticated && isAdmin,
  });

  const materialSystemVocabQuery = useQuery({
    queryKey: ["vocabularies", "material_system", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "material_system"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const precursorMethodVocabQuery = useQuery({
    queryKey: ["vocabularies", "precursor_method", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "precursor_method"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const substrateTypeVocabQuery = useQuery({
    queryKey: ["vocabularies", "substrate_type", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "substrate_type"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const substrateBrandVocabQuery = useQuery({
    queryKey: ["vocabularies", "substrate_brand", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "substrate_brand"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const substrateSizeVocabQuery = useQuery({
    queryKey: ["vocabularies", "substrate_size", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "substrate_size"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const substrateTreatmentVocabQuery = useQuery({
    queryKey: ["vocabularies", "substrate_treatment_method", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "substrate_treatment_method"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const gasLabelVocabQuery = useQuery({
    queryKey: ["vocabularies", "gas_label", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "gas_label"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const characterizationMethodVocabQuery = useQuery({
    queryKey: ["vocabularies", "characterization_method", currentUser?.id ?? "anonymous"],
    queryFn: () => listActiveVocabularies(session.accessToken!, "characterization_method"),
    enabled: session.isAuthenticated && isAdmin,
  });

  const toOptions = (query: typeof materialSystemVocabQuery) =>
    (query.data?.items ?? []).map((item) => ({
      label: item.label_zh || item.value,
      value: item.value,
    }));

  const vocabularyOptions = useMemo(
    () => ({
      material_system: toOptions(materialSystemVocabQuery),
      precursor_method: toOptions(precursorMethodVocabQuery),
      substrate_type: toOptions(substrateTypeVocabQuery),
      substrate_brand: toOptions(substrateBrandVocabQuery),
      substrate_size: toOptions(substrateSizeVocabQuery),
      substrate_treatment_method: toOptions(substrateTreatmentVocabQuery),
      gas_label: toOptions(gasLabelVocabQuery),
      characterization_method: toOptions(characterizationMethodVocabQuery),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      materialSystemVocabQuery.data,
      precursorMethodVocabQuery.data,
      substrateTypeVocabQuery.data,
      substrateBrandVocabQuery.data,
      substrateSizeVocabQuery.data,
      substrateTreatmentVocabQuery.data,
      gasLabelVocabQuery.data,
      characterizationMethodVocabQuery.data,
    ],
  );

  const materialOptions = useMemo(
    () => vocabularyOptions.material_system,
    [vocabularyOptions.material_system],
  );

  const filterOptions = useMemo(
    () => [
      { label: "全部", value: "" },
      ...materialOptions.map((item) => ({
        label: item.label,
        value: item.value,
      })),
    ],
    [materialOptions],
  );

  const experimentsQuery = useQuery({
    queryKey: ["experiments", "import", importSearch, currentUser?.id ?? "anonymous"],
    queryFn: () =>
      listExperiments(session.accessToken!, {
        status: ["submitted", "locked"],
        q: importSearch || undefined,
      }),
    enabled: session.isAuthenticated && isAdmin && importOpen,
  });

  const importMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      const modules = await listExperimentModules(session.accessToken!, experimentId);
      const payload: Record<string, unknown> = {};
      for (const mod of modules.items) {
        if (RECIPE_MODULE_KEYS.has(mod.module_key)) {
          payload[mod.module_key] = sanitizeModulePayload(
            mod.module_key,
            mod.payload_json,
          );
        }
      }
      return payload;
    },
    onSuccess: (payload) => {
      setCreateForm((prev) => ({ ...prev, defaultPayloadJson: payload }));
      setImportOpen(false);
      setFeedback({ message: "已从实验导入参数", type: "success" });
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "导入实验参数失败"),
        type: "error",
      });
    },
  });

  const invalidateRecipeQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryPrefix,
      }),
      queryClient.invalidateQueries({
        queryKey: ["recipes"],
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (payload: RecipeCreateRequest) => createRecipe(session.accessToken!, payload),
    onSuccess: async () => {
      setFeedback({ message: "Recipe 创建成功", type: "success" });
      setCreateOpen(false);
      setCreateForm(defaultCreateFormState);
      await invalidateRecipeQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "Recipe 创建失败"),
        type: "error",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ payload, recipeId }: { payload: RecipeUpdateRequest; recipeId: string }) =>
      updateRecipe(session.accessToken!, recipeId, payload),
    onSuccess: async () => {
      setFeedback({ message: "Recipe 更新成功", type: "success" });
      setEditTarget(null);
      setEditForm(null);
      await invalidateRecipeQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "Recipe 更新失败"),
        type: "error",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (recipeId: string) => deactivateRecipe(session.accessToken!, recipeId),
    onSuccess: async () => {
      setFeedback({ message: "Recipe 已停用", type: "success" });
      await invalidateRecipeQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "Recipe 停用失败"),
        type: "error",
      });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (recipeId: string) =>
      updateRecipe(session.accessToken!, recipeId, { is_active: true }),
    onSuccess: async () => {
      setFeedback({ message: "Recipe 已重新激活", type: "success" });
      await invalidateRecipeQueries();
    },
    onError: (error) => {
      setFeedback({
        message: resolveErrorMessage(error, "Recipe 重新激活失败"),
        type: "error",
      });
    },
  });

  const handleCreateSubmit = () => {
    setFeedback(null);
    const result = buildCreatePayload(createForm);
    if (result.error || !result.payload) {
      setFeedback({ message: result.error ?? "Recipe 创建失败", type: "error" });
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
      setFeedback({ message: result.error ?? "Recipe 更新失败", type: "error" });
      return;
    }

    updateMutation.mutate({ payload: result.payload, recipeId: editTarget.id });
  };

  if (!isAdmin) {
    return (
      <div className="content-stack">
        <PageHeader subtitle="Recipe 管理仅对管理员开放。" title="Recipe 管理" />
        <Alert message="当前账号没有 Recipe 管理权限。" showIcon type="warning" />
      </div>
    );
  }

  const rows = recipesQuery.data?.items ?? [];

  const experimentColumns = [
    {
      dataIndex: "run_code",
      key: "run_code",
      title: "运行编号",
    },
    {
      dataIndex: "material_system",
      key: "material_system",
      render: (value: string | null) => value || "-",
      title: "材料体系",
    },
    {
      dataIndex: "status",
      key: "status",
      title: "状态",
    },
    {
      dataIndex: "created_at",
      key: "created_at",
      render: (value: string) => formatDateTime(value),
      title: "创建时间",
    },
    {
      key: "actions",
      render: (_value: unknown, record: ExperimentRead) => (
        <Button
          loading={importMutation.isPending}
          onClick={() => importMutation.mutate(record.id)}
          size="small"
          type="link"
        >
          导入
        </Button>
      ),
      title: "操作",
    },
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
            新增 Recipe
          </Button>
        }
        subtitle="管理可复用的实验默认参数，Recipe 可用于快速创建标准化实验草稿。"
        title="Recipe 管理"
      />

      {feedback ? <Alert message={feedback.message} showIcon type={feedback.type} /> : null}

      <Card>
        <Space align="end" size={16} wrap>
          <Form.Item htmlFor="recipe-filter-material" label="材料体系筛选" style={{ marginBottom: 0 }}>
            <Select
              aria-label="材料体系筛选"
              allowClear
              id="recipe-filter-material"
              loading={materialSystemVocabQuery.isLoading}
              onChange={(value) => {
                setAppliedFilter(value ?? "");
              }}
              options={filterOptions}
              placeholder="选择材料体系"
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
        {recipesQuery.isLoading ? (
          <LoadingState />
        ) : recipesQuery.isError ? (
          <Alert
            message={resolveErrorMessage(recipesQuery.error, "Recipe 列表加载失败")}
            showIcon
            type="error"
          />
        ) : rows.length === 0 ? (
          <EmptyState description="当前筛选条件下还没有 Recipe。可清空筛选或新增 Recipe。" />
        ) : (
          <Table
            columns={[
              {
                dataIndex: "name",
                key: "name",
                title: "名称",
              },
              {
                dataIndex: "material_system",
                key: "material_system",
                render: (value: string | null) => value || "-",
                title: "材料体系",
              },
              {
                dataIndex: "description",
                key: "description",
                render: (value: string | null) => value || "-",
                title: "描述",
              },
              {
                dataIndex: "created_by",
                key: "created_by",
                render: (value: string | null) =>
                  value ? value.slice(0, 8) + "\u2026" : "-",
                title: "创建者",
              },
              {
                dataIndex: "created_at",
                key: "created_at",
                render: (value: string) => formatDateTime(value),
                title: "创建时间",
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
                render: (_value: unknown, record: RecipeRead) => (
                  <Space wrap>
                    <Button
                      aria-label={`编辑 ${record.name}`}
                      onClick={() => {
                        setFeedback(null);
                        setEditTarget(record);
                        setEditForm(toFormState(record));
                      }}
                    >
                      编辑
                    </Button>
                    {record.is_active ? (
                      <Popconfirm
                        cancelText="取消"
                        okButtonProps={{
                          loading:
                            deactivateMutation.isPending &&
                            deactivateMutation.variables === record.id,
                        }}
                        okText="确认停用"
                        onConfirm={() => {
                          setFeedback(null);
                          deactivateMutation.mutate(record.id);
                        }}
                        title="确认停用 Recipe？"
                      >
                        <Button
                          aria-label={`停用 ${record.name}`}
                          loading={
                            deactivateMutation.isPending &&
                            deactivateMutation.variables === record.id
                          }
                        >
                          停用
                        </Button>
                      </Popconfirm>
                    ) : (
                      <Button
                        loading={
                          reactivateMutation.isPending &&
                          reactivateMutation.variables === record.id
                        }
                        onClick={() => {
                          setFeedback(null);
                          reactivateMutation.mutate(record.id);
                        }}
                        type="link"
                      >
                        重新激活
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
        title="新增 Recipe"
        width={960}
      >
        <RecipeForm
          formState={createForm}
          loading={createMutation.isPending}
          materialOptions={materialOptions}
          materialSystemAriaLabel="创建材料体系"
          onChange={setCreateForm}
          onImportFromExperiment={() => setImportOpen(true)}
          onSubmit={handleCreateSubmit}
          submitText="创建 Recipe"
          vocabularyOptions={vocabularyOptions}
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
        title={editTarget ? `编辑 Recipe \u00B7 ${editTarget.name}` : "编辑 Recipe"}
        width={960}
      >
        {editTarget && editForm ? (
          <RecipeForm
            formState={editForm}
            loading={updateMutation.isPending}
            materialOptions={materialOptions}
            materialSystemAriaLabel="编辑材料体系"
            onChange={setEditForm}
            onSubmit={handleEditSubmit}
            submitText="保存修改"
            vocabularyOptions={vocabularyOptions}
          />
        ) : null}
      </Modal>

      <Modal
        destroyOnHidden
        onCancel={() => setImportOpen(false)}
        open={importOpen}
        title="从实验导入"
        width={800}
      >
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.Search
            allowClear
            enterButton
            onSearch={(value) => setImportSearch(value)}
            placeholder="搜索实验编号或材料体系"
          />
          {experimentsQuery.isLoading ? (
            <LoadingState />
          ) : experimentsQuery.isError ? (
            <Alert
              message={resolveErrorMessage(experimentsQuery.error, "实验列表加载失败")}
              showIcon
              type="error"
            />
          ) : (
            <Table
              columns={experimentColumns}
              dataSource={experimentsQuery.data?.items ?? []}
              pagination={{ pageSize: 10 }}
              rowKey="id"
              scroll={{ y: 400 }}
              size="small"
            />
          )}
        </Space>
      </Modal>
    </div>
  );
}
