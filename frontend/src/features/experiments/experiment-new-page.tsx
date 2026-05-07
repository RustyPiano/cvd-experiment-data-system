import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Card, Col, Divider, List, Modal, Row, Space, Spin, Tag, Typography } from "antd";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import type { ExperimentRead, RecipeRead } from "../../shared/types/api";
import { EmptyState } from "../../shared/ui/empty-state";
import { PageHeader } from "../../shared/ui/page-header";
import {
  cloneExperiment,
  createExperiment,
  createExperimentFromRecipe,
  listExperimentModules,
  listExperiments,
} from "./api";
import { HistoryCloneDialog } from "./components/history-clone-dialog";
import { useAuth } from "../auth/use-auth";
import { listActiveRecipes } from "../recipes/api";

const MODULE_LABELS: Record<string, string> = {
  precursors: "前驱体",
  substrates: "基底",
  furnace_program: "温区程序",
  gas_program: "气体程序",
  characterization: "表征计划",
};

const RECIPE_MODULE_KEYS = ["precursors", "substrates", "furnace_program", "gas_program", "characterization"];

function getModuleSummary(moduleKey: string, data: Record<string, unknown>): string {
  switch (moduleKey) {
    case "precursors": {
      const items = Array.isArray(data.items) ? data.items : [];
      const species = items.map((item: Record<string, unknown>) => (item.species as string) || "未命名").join(", ");
      return `${items.length} 条${species ? ` (${species})` : ""}`;
    }
    case "substrates": {
      const items = Array.isArray(data.items) ? data.items : [];
      return `${items.length} 条`;
    }
    case "furnace_program": {
      const zones = Array.isArray(data.zones) ? data.zones : [];
      return `${zones.length} 个温区`;
    }
    case "gas_program": {
      const segments = Array.isArray(data.segments) ? data.segments : [];
      return `${segments.length} 段${data.pre_washing_gas ? `，洗炉: ${data.pre_washing_gas}` : ""}`;
    }
    case "characterization": {
      const methods = Array.isArray(data.methods) ? data.methods : [];
      const methodNames = methods.map((m: Record<string, unknown>) => (m.method as string) || "未命名").join(", ");
      return `${methods.length} 个方法${methodNames ? ` (${methodNames})` : ""}`;
    }
    default:
      return "已配置";
  }
}

function RecipeModuleSummaries({ payload }: { payload: Record<string, unknown> }) {
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      {RECIPE_MODULE_KEYS.map((key) => {
        const moduleData = payload[key];
        const label = MODULE_LABELS[key];
        if (!moduleData || typeof moduleData !== "object") {
          return (
            <div key={key} style={{ display: "flex", justifyContent: "space-between" }}>
              <Typography.Text type="secondary">{label}</Typography.Text>
              <Tag>空</Tag>
            </div>
          );
        }

        const summary = getModuleSummary(key, moduleData as Record<string, unknown>);
        return (
          <div key={key} style={{ display: "flex", justifyContent: "space-between" }}>
            <Typography.Text>{label}</Typography.Text>
            <Tag color="green">{summary}</Tag>
          </div>
        );
      })}
    </Space>
  );
}

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return error.detail || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function groupRecipesByMaterialSystem(recipes: RecipeRead[]) {
  return recipes.reduce<Array<{ materialSystem: string; recipes: RecipeRead[] }>>((groups, recipe) => {
    const materialSystem = recipe.material_system || "未分组";
    const existingGroup = groups.find((group) => group.materialSystem === materialSystem);

    if (existingGroup) {
      existingGroup.recipes.push(recipe);
      return groups;
    }

    groups.push({ materialSystem, recipes: [recipe] });
    return groups;
  }, []);
}

const inheritanceStoragePrefix = "experiment:inherit:";

function inheritanceStorageKey(sourceExperimentId: string) {
  return `${inheritanceStoragePrefix}${sourceExperimentId}`;
}

function writeInheritancePayload({
  environment,
  precheck,
  sourceExperiment,
}: {
  environment?: Record<string, unknown>;
  precheck?: Record<string, unknown>;
  sourceExperiment: ExperimentRead;
}) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    inheritanceStorageKey(sourceExperiment.id),
    JSON.stringify({
      sourceExperimentId: sourceExperiment.id,
      sourceRunCode: sourceExperiment.run_code,
      environment: environment ?? null,
      precheck: precheck ?? null,
    }),
  );
}

function removeInheritancePayload(sourceExperimentId: string | null) {
  if (!sourceExperimentId || typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(inheritanceStorageKey(sourceExperimentId));
}

export function ExperimentNewPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { message } = App.useApp();
  const isViewer = session.currentUser?.role === "viewer";
  const [historyCloneOpen, setHistoryCloneOpen] = useState(false);
  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [recipeCreateError, setRecipeCreateError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeRead | null>(null);

  const navigateToEditor = (experiment: ExperimentRead, inheritFrom?: string | null) => {
    const searchParams = inheritFrom ? `?inheritFrom=${encodeURIComponent(inheritFrom)}` : "";
    navigate(`/experiments/${experiment.id}/edit${searchParams}`);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      let inheritFrom: string | null = null;
      const recentResponse = await listExperiments(session.accessToken!, {
        mine: true,
        status: ["draft", "submitted", "locked"],
        sortBy: "updated_at",
        sortOrder: "desc",
        page: 1,
        pageSize: 1,
      });
      const sourceExperiment = recentResponse.items[0];

      if (sourceExperiment) {
        const modulesResponse = await listExperimentModules(session.accessToken!, sourceExperiment.id);
        const modulePayloads = Object.fromEntries(
          modulesResponse.items.map((module) => [module.module_key, module.payload_json]),
        );
        writeInheritancePayload({
          environment: modulePayloads.environment,
          precheck: modulePayloads.precheck,
          sourceExperiment,
        });
        inheritFrom = sourceExperiment.id;
      }

      try {
        const experiment = await createExperiment(session.accessToken!, {
          experiment_type: "cvd",
          material_system: null,
          experiment_date: dayjs().format("YYYY-MM-DD"),
          objective: null,
        });
        return { experiment, inheritFrom };
      } catch (error) {
        removeInheritancePayload(inheritFrom);
        throw error;
      }
    },
    onSuccess: ({ experiment, inheritFrom }) => {
      setActionError(null);
      message.success("实验创建成功");
      navigateToEditor(experiment, inheritFrom);
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, "创建实验失败"));
    },
  });

  const recentCloneMutation = useMutation({
    mutationFn: async () => {
      const response = await listExperiments(session.accessToken!, {
        mine: true,
        page: 1,
        pageSize: 1,
        status: ["submitted", "locked"],
      });

      const sourceExperiment = response.items[0];
      if (!sourceExperiment) {
        throw new Error("最近没有可复制的已提交或已锁定实验。");
      }

      return cloneExperiment(session.accessToken!, sourceExperiment.id);
    },
    onSuccess: (experiment) => {
      setActionError(null);
      message.success("实验复制成功");
      navigateToEditor(experiment);
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, "复制最近一条实验失败"));
    },
  });

  const recipesQuery = useQuery({
    enabled: recipeModalOpen && Boolean(session.accessToken) && !isViewer,
    queryFn: () => listActiveRecipes(session.accessToken!),
    queryKey: ["recipes", "active", "experiment-new"],
  });

  const groupedRecipes = useMemo(
    () => groupRecipesByMaterialSystem(recipesQuery.data?.items ?? []),
    [recipesQuery.data?.items],
  );

  const createFromRecipeMutation = useMutation({
    mutationFn: (recipeId: string) =>
      createExperimentFromRecipe(session.accessToken!, {
        recipe_id: recipeId,
        experiment_date: dayjs().format("YYYY-MM-DD"),
      }),
    onSuccess: (experiment) => {
      setActionError(null);
      setRecipeCreateError(null);
      setSelectedRecipe(null);
      setRecipeModalOpen(false);
      message.success("实验创建成功");
      navigateToEditor(experiment);
    },
    onError: (error) => {
      setRecipeCreateError(resolveErrorMessage(error, "从 Recipe 创建实验失败"));
    },
  });

  return (
    <div className="content-stack">
      <PageHeader
        subtitle="支持空白创建、复制最近一条实验，或从 Recipe 快速创建标准化草稿。"
        title="新建实验"
      />
      {isViewer ? (
        <Alert title="当前账号没有创建实验权限。" showIcon type="warning" />
      ) : null}
      {actionError ? <Alert title={actionError} showIcon type="error" /> : null}
      <Row gutter={[16, 16]}>
        <Col md={8} xs={24}>
          <Card className="action-card">
            <Space orientation="vertical" size={12}>
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
                    setActionError(null);
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
        <Col md={8} xs={24}>
          <Card className="action-card">
            <Space orientation="vertical" size={12}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                复制我的最近一条
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                系统会优先查找你最近更新的一条已提交或已锁定实验，并直接派生出新草稿。
              </Typography.Paragraph>
              {!isViewer ? (
                <Space wrap>
                  <Button
                    loading={recentCloneMutation.isPending}
                    onClick={() => {
                      setActionError(null);
                      recentCloneMutation.mutate();
                    }}
                  >
                    复制最近一条
                  </Button>
                  <Button
                    onClick={() => {
                      setActionError(null);
                      setHistoryCloneOpen(true);
                    }}
                    type="link"
                  >
                    搜索历史实验
                  </Button>
                </Space>
              ) : null}
            </Space>
          </Card>
        </Col>
        <Col md={8} xs={24}>
          <Card className="action-card">
            <Space orientation="vertical" size={12}>
              <Typography.Title level={4} style={{ margin: 0 }}>
                从 Recipe 创建
              </Typography.Title>
              <Typography.Paragraph type="secondary">
                选择已维护的 Recipe，将默认参数带入新草稿，适合重复工艺快速起步。
              </Typography.Paragraph>
              {!isViewer ? (
                <Button
                  onClick={() => {
                    setActionError(null);
                    setRecipeCreateError(null);
                    setRecipeModalOpen(true);
                  }}
                >
                  选择 Recipe
                </Button>
              ) : null}
            </Space>
          </Card>
        </Col>
      </Row>

      {session.accessToken && session.currentUser ? (
        <HistoryCloneDialog
          accessToken={session.accessToken}
          currentUserId={session.currentUser.id}
          onCancel={() => {
            setHistoryCloneOpen(false);
          }}
          onCloned={(experiment) => {
            setHistoryCloneOpen(false);
            navigateToEditor(experiment);
          }}
          open={historyCloneOpen}
        />
      ) : null}

      <Modal
        destroyOnHidden
        footer={null}
        onCancel={() => {
          setRecipeCreateError(null);
          setSelectedRecipe(null);
          setRecipeModalOpen(false);
        }}
        open={recipeModalOpen}
        title="从 Recipe 创建实验"
        width={760}
      >
        {selectedRecipe ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {recipeCreateError ? <Alert message={recipeCreateError} showIcon type="error" /> : null}
            <div>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {selectedRecipe.name}
              </Typography.Title>
              {selectedRecipe.description ? (
                <Typography.Paragraph type="secondary" style={{ margin: "4px 0 0" }}>
                  {selectedRecipe.description}
                </Typography.Paragraph>
              ) : null}
              {selectedRecipe.material_system ? (
                <Tag color="blue" style={{ marginTop: 4 }}>
                  {selectedRecipe.material_system}
                </Tag>
              ) : null}
            </div>
            <Divider style={{ margin: 0 }} />
            {Object.keys(selectedRecipe.default_payload_json).length === 0 ? (
              <Alert message="此 Recipe 未配置默认参数，将创建空白实验。" showIcon type="info" />
            ) : (
              <RecipeModuleSummaries payload={selectedRecipe.default_payload_json} />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button
                onClick={() => {
                  setSelectedRecipe(null);
                  setRecipeCreateError(null);
                }}
              >
                返回
              </Button>
              <Button
                loading={createFromRecipeMutation.isPending}
                onClick={() => {
                  setActionError(null);
                  setRecipeCreateError(null);
                  createFromRecipeMutation.mutate(selectedRecipe.id);
                }}
                type="primary"
              >
                确认创建实验
              </Button>
            </div>
          </Space>
        ) : recipesQuery.isLoading ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <Spin />
          </div>
        ) : recipesQuery.isError ? (
          <Alert
            message={resolveErrorMessage(recipesQuery.error, "Recipe 列表加载失败")}
            showIcon
            type="error"
          />
        ) : groupedRecipes.length === 0 ? (
          <EmptyState description="当前没有可用的 Recipe。" />
        ) : (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {recipeCreateError ? <Alert message={recipeCreateError} showIcon type="error" /> : null}
            {groupedRecipes.map((group) => (
              <section key={group.materialSystem}>
                <Divider plain titlePlacement="left">
                  <Typography.Title level={5} style={{ margin: 0 }}>
                    {group.materialSystem}
                  </Typography.Title>
                </Divider>
                <List
                  dataSource={group.recipes}
                  itemLayout="vertical"
                  renderItem={(recipe) => (
                    <List.Item
                      actions={[
                        <Button
                          key="preview"
                          onClick={() => {
                            setActionError(null);
                            setRecipeCreateError(null);
                            setSelectedRecipe(recipe);
                          }}
                          type="primary"
                        >
                          预览 {recipe.name}
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        description={recipe.description || "暂无描述"}
                        title={recipe.name}
                      />
                    </List.Item>
                  )}
                />
              </section>
            ))}
          </Space>
        )}
      </Modal>
    </div>
  );
}
