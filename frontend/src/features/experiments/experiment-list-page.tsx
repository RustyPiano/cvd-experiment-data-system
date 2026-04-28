import { useMemo, useRef, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Input,
  Modal,
  Row,
  Space,
  Statistic,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useNavigate, useSearchParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { triggerBlobDownload } from "../../shared/lib/download";
import { useDebounce } from "../../shared/lib/use-debounce";
import type { ExperimentRead, ExperimentStatus } from "../../shared/types/api";
import { PageHeader } from "../../shared/ui/page-header";
import { LoadingState } from "../../shared/ui/loading-state";
import { StatusTag } from "../../shared/ui/status-tag";
import {
  cloneExperiment,
  downloadExperimentExcel,
  exportExperimentJson,
  invalidateExperiment,
  listExperiments,
  lockExperiment,
  type ExperimentSortField,
} from "./api";
import { ExperimentTable } from "./components/experiment-table";
import { useAuth } from "../auth/use-auth";

type ExperimentListFilters = {
  materialSystem: string;
  mine: boolean;
  page: number;
  pageSize: number;
  q: string;
  sortBy: ExperimentSortField | null;
  sortOrder: "asc" | "desc" | null;
  status: ExperimentStatus[];
};

type ExperimentListFilterState = {
  filters: ExperimentListFilters;
  urlKey: string;
};

type TransitionAction = "lock" | "clone" | "invalidate";

const defaultFilters: ExperimentListFilters = {
  materialSystem: "",
  mine: false,
  page: 1,
  pageSize: 10,
  q: "",
  sortBy: null,
  sortOrder: null,
  status: [],
};

const urlFilterStatuses = new Set<ExperimentStatus>([
  "draft",
  "submitted",
  "locked",
  "invalid",
]);

function isExperimentStatus(value: string): value is ExperimentStatus {
  return urlFilterStatuses.has(value as ExperimentStatus);
}

function parseUrlStatusFilters(searchParams: URLSearchParams) {
  const statuses: ExperimentStatus[] = [];

  for (const statusParam of searchParams.getAll("status")) {
    for (const status of statusParam.split(",")) {
      const normalizedStatus = status.trim();
      if (isExperimentStatus(normalizedStatus) && !statuses.includes(normalizedStatus)) {
        statuses.push(normalizedStatus);
      }
    }
  }

  return statuses;
}

function parseUrlFilters(searchParams: URLSearchParams) {
  const q = searchParams.get("q") || "";
  const mine = searchParams.get("mine") === "true";
  const status = parseUrlStatusFilters(searchParams);

  return {
    key: JSON.stringify({
      mine,
      q,
      status,
    }),
    mine,
    q,
    status,
  };
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

export function ExperimentListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const searchParamString = searchParams.toString();
  const urlFilters = useMemo(
    () => parseUrlFilters(new URLSearchParams(searchParamString)),
    [searchParamString],
  );

  const [filterState, setFilterState] = useState<ExperimentListFilterState>({
    filters: {
      ...defaultFilters,
      mine: urlFilters.mine,
      q: urlFilters.q,
      status: urlFilters.status,
    },
    urlKey: urlFilters.key,
  });
  const filters = useMemo(
    () =>
      filterState.urlKey === urlFilters.key
        ? filterState.filters
        : {
            ...filterState.filters,
            page: 1,
            mine: urlFilters.mine,
            q: urlFilters.q,
            status: urlFilters.status,
          },
    [filterState, urlFilters],
  );
  const setFilters = (
    updater: (current: ExperimentListFilters) => ExperimentListFilters,
  ) => {
    setFilterState((current) => {
      const currentFilters =
        current.urlKey === urlFilters.key
          ? current.filters
          : {
              ...current.filters,
              page: 1,
              mine: urlFilters.mine,
              q: urlFilters.q,
              status: urlFilters.status,
            };
      return {
        filters: updater(currentFilters),
        urlKey: urlFilters.key,
      };
    });
  };
  const [listActionError, setListActionError] = useState<string | null>(null);
  const [activeExportKey, setActiveExportKey] = useState<string | null>(null);
  const [activeTransitionKey, setActiveTransitionKey] = useState<string | null>(null);
  const [invalidateTarget, setInvalidateTarget] = useState<ExperimentRead | null>(null);
  const [invalidateReason, setInvalidateReason] = useState("");
  const [invalidateValidation, setInvalidateValidation] = useState<string | null>(null);
  const activeTransitionRef = useRef<string | null>(null);
  const canCreateExperiment = session.currentUser?.role !== "viewer";

  const debouncedQ = useDebounce(filters.q, 400);
  const debouncedMaterialSystem = useDebounce(filters.materialSystem, 400);

  const normalizedFilters = useMemo(
    () => ({
      ...filters,
      materialSystem: debouncedMaterialSystem.trim(),
      q: debouncedQ.trim(),
    }),
    [filters, debouncedQ, debouncedMaterialSystem],
  );

  const experimentQuery = useQuery({
    queryKey: ["experiments", "list", session.currentUser?.id ?? "anonymous", normalizedFilters],
    queryFn: () =>
      listExperiments(session.accessToken!, {
        mine: normalizedFilters.mine,
        status: normalizedFilters.status,
        materialSystem: normalizedFilters.materialSystem || null,
        page: normalizedFilters.page,
        pageSize: normalizedFilters.pageSize,
        q: normalizedFilters.q || null,
        sortBy: normalizedFilters.sortBy,
        sortOrder: normalizedFilters.sortOrder,
      }),
    enabled: session.isAuthenticated,
  });

  const myDraftsQuery = useQuery({
    queryKey: ["experiments", "dashboard", "my-drafts", session.currentUser?.id ?? "anonymous"],
    queryFn: () =>
      listExperiments(session.accessToken!, {
        mine: true,
        status: ["draft"],
        page: 1,
        pageSize: 1,
      }),
    enabled: session.isAuthenticated,
  });

  const pendingActionQuery = useQuery({
    queryKey: ["experiments", "dashboard", "pending-action", session.currentUser?.id ?? "anonymous"],
    queryFn: () =>
      listExperiments(session.accessToken!, {
        mine: true,
        status: ["submitted"],
        page: 1,
        pageSize: 1,
      }),
    enabled: session.isAuthenticated,
  });

  const recentEditedQuery = useQuery({
    queryKey: ["experiments", "dashboard", "recent-edited", session.currentUser?.id ?? "anonymous"],
    queryFn: () =>
      listExperiments(session.accessToken!, {
        mine: true,
        sortBy: "updated_at",
        sortOrder: "desc",
        page: 1,
        pageSize: 3,
      }),
    enabled: session.isAuthenticated,
  });

  const resetFilters = () => {
    setFilters(() => defaultFilters);
    navigate("/experiments");
    setListActionError(null);
  };

  const applyMyDraftsFilter = () => {
    navigate("/experiments?mine=true&status=draft");
  };

  const handleExportJson = async (experiment: ExperimentRead) => {
    setActiveExportKey(`${experiment.id}:json`);
    setListActionError(null);

    try {
      const payload = await exportExperimentJson(session.accessToken!, experiment.id);
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      triggerBlobDownload(blob, `${experiment.run_code}-export.json`);
    } catch (error) {
      setListActionError(resolveErrorMessage(error, "JSON 导出失败"));
    } finally {
      setActiveExportKey(null);
    }
  };

  const handleExportExcel = async (experiment: ExperimentRead) => {
    setActiveExportKey(`${experiment.id}:excel`);
    setListActionError(null);

    try {
      const payload = await downloadExperimentExcel(session.accessToken!, experiment.id);
      triggerBlobDownload(payload.blob, payload.filename || `${experiment.run_code}.xlsx`);
    } catch (error) {
      setListActionError(resolveErrorMessage(error, "Excel 导出失败"));
    } finally {
      setActiveExportKey(null);
    }
  };

  const refreshExperimentCaches = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["experiments"],
    });
  };

  const runTransition = async (
    experiment: ExperimentRead,
    action: TransitionAction,
    task: () => Promise<void>,
  ) => {
    const transitionKey = `${experiment.id}:${action}`;
    if (activeTransitionRef.current) {
      return false;
    }

    activeTransitionRef.current = transitionKey;
    setActiveTransitionKey(transitionKey);
    setListActionError(null);

    try {
      await task();
      await refreshExperimentCaches();
      return true;
    } finally {
      activeTransitionRef.current = null;
      setActiveTransitionKey(null);
    }
  };

  const handleLock = async (experiment: ExperimentRead) => {
    if (activeTransitionRef.current) {
      return;
    }

    const confirmed = window.confirm(
      `锁定实验 ${experiment.run_code}？锁定后不可修改，只能派生新实验。此操作会写入审计日志。`,
    );
    if (!confirmed) {
      return;
    }

    try {
      await runTransition(experiment, "lock", async () => {
        await lockExperiment(session.accessToken!, experiment.id);
      });
    } catch (error) {
      setListActionError(resolveErrorMessage(error, "锁定实验失败"));
    }
  };

  const handleClone = async (experiment: ExperimentRead) => {
    if (activeTransitionRef.current) {
      return;
    }

    const confirmed = window.confirm(
      `将派生实验 ${experiment.run_code} 的参数为新草稿。确定继续？`,
    );
    if (!confirmed) {
      return;
    }

    try {
      let clonedExperimentId: string | null = null;
      const didRun = await runTransition(experiment, "clone", async () => {
        const clonedExperiment = await cloneExperiment(session.accessToken!, experiment.id);
        clonedExperimentId = clonedExperiment.id;
      });
      if (!didRun || !clonedExperimentId) {
        return;
      }
      navigate(`/experiments/${clonedExperimentId}/edit`);
    } catch (error) {
      setListActionError(resolveErrorMessage(error, "派生草稿失败"));
    }
  };

  const openInvalidateModal = (experiment: ExperimentRead) => {
    if (activeTransitionRef.current) {
      return;
    }

    setListActionError(null);
    setInvalidateValidation(null);
    setInvalidateReason("");
    setInvalidateTarget(experiment);
  };

  const closeInvalidateModal = () => {
    if (activeTransitionKey?.endsWith(":invalidate")) {
      return;
    }

    setInvalidateTarget(null);
    setInvalidateReason("");
    setInvalidateValidation(null);
  };

  const submitInvalidate = async () => {
    if (!invalidateTarget || activeTransitionRef.current) {
      return;
    }

    const normalizedReason = invalidateReason.trim();
    if (!normalizedReason) {
      setInvalidateValidation("请填写作废原因");
      return;
    }

    try {
      await runTransition(invalidateTarget, "invalidate", async () => {
        await invalidateExperiment(session.accessToken!, invalidateTarget.id, {
          reason: normalizedReason,
        });
      });
      closeInvalidateModal();
    } catch (error) {
      setListActionError(resolveErrorMessage(error, "作废实验失败"));
    }
  };

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

      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card
            aria-label="我的草稿"
            hoverable
            loading={myDraftsQuery.isLoading}
            onClick={applyMyDraftsFilter}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                applyMyDraftsFilter();
              }
            }}
            role="button"
            tabIndex={0}
          >
            <Statistic
              title="我的草稿"
              value={myDraftsQuery.isError ? "-" : (myDraftsQuery.data?.total ?? 0)}
            />
            {myDraftsQuery.isError ? (
              <Typography.Text type="danger">加载失败</Typography.Text>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card loading={pendingActionQuery.isLoading}>
            <Statistic
              title="待操作"
              value={pendingActionQuery.isError ? "-" : (pendingActionQuery.data?.total ?? 0)}
            />
            {pendingActionQuery.isError ? (
              <Typography.Text type="danger">加载失败</Typography.Text>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card data-testid="recent-experiments-card" loading={recentEditedQuery.isLoading} title="最近编辑">
            {recentEditedQuery.isError ? (
              <Typography.Text type="danger">加载失败</Typography.Text>
            ) : recentEditedQuery.data?.items.length ? (
              <div role="list">
                {recentEditedQuery.data.items.map((experiment) => (
                  <div
                    key={experiment.id}
                    role="listitem"
                    style={{
                      borderBottom: "1px solid #f0f0f0",
                      padding: "8px 0",
                    }}
                  >
                    <Space size={8} wrap>
                      <Typography.Text strong>{experiment.run_code}</Typography.Text>
                      <StatusTag status={experiment.status} />
                    </Space>
                    <div style={{ marginTop: 4 }}>
                      <Space size={8} wrap>
                        <Typography.Text>{experiment.material_system || "未填写"}</Typography.Text>
                        <Typography.Text type="secondary">
                          {dayjs(experiment.updated_at).format("YYYY-MM-DD HH:mm")}
                        </Typography.Text>
                      </Space>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="暂无最近编辑" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>

      {experimentQuery.isError ? (
        <Alert
          title={resolveErrorMessage(experimentQuery.error, "实验列表加载失败")}
          showIcon
          type="error"
        />
      ) : null}
      {listActionError ? <Alert title={listActionError} showIcon type="error" /> : null}

      <Card>
        <div className="content-stack">
          <Space align="start" size={12} wrap>
            <Input
                allowClear
                aria-label="实验搜索"
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    page: 1,
                    q: event.target.value,
                  }));
                }}
                placeholder="搜索实验编号、材料体系或目标"
                style={{ width: 280 }}
                value={filters.q}
              />
              <Input
                allowClear
                aria-label="材料体系筛选"
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    page: 1,
                    materialSystem: event.target.value,
                  }));
                }}
                placeholder="材料体系筛选"
                style={{ width: 180 }}
                value={filters.materialSystem}
              />
              <Checkbox
                checked={filters.mine}
                onChange={(event) => {
                  setFilters((current) => ({
                    ...current,
                    page: 1,
                    mine: event.target.checked,
                  }));
                }}
            >
              我的实验
            </Checkbox>
              <Checkbox.Group
                onChange={(checkedValues) => {
                  setFilters((current) => ({
                    ...current,
                    page: 1,
                    status: checkedValues as ExperimentStatus[],
                  }));
                }}
              options={[
                { label: "草稿", value: "draft" },
                { label: "已提交", value: "submitted" },
                { label: "已锁定", value: "locked" },
                { label: "已作废", value: "invalid" },
              ]}
                value={filters.status}
              />
              <Button onClick={resetFilters}>重置</Button>
          </Space>

          <Typography.Text type="secondary">
            当前共 {experimentQuery.data?.total ?? 0} 条记录，支持列表内直接导出 JSON / Excel。
          </Typography.Text>

            {experimentQuery.isLoading ? (
              <LoadingState />
            ) : (
            <ExperimentTable
              activeExportKey={activeExportKey}
              activeTransitionKey={activeTransitionKey}
              currentUser={session.currentUser ?? null}
              items={experimentQuery.data?.items ?? []}
              loading={false}
              onClone={(experiment) => {
                void handleClone(experiment);
              }}
              onExportExcel={(experiment) => {
                void handleExportExcel(experiment);
              }}
              onExportJson={(experiment) => {
                void handleExportJson(experiment);
              }}
              onInvalidate={(experiment) => {
                openInvalidateModal(experiment);
              }}
              onLock={(experiment) => {
                void handleLock(experiment);
              }}
                onTableChange={(page, pageSize, sortField, sortOrder) => {
                  setFilters((current) => ({
                    ...current,
                    page,
                    pageSize,
                    sortBy: sortField,
                    sortOrder: sortOrder === "ascend" ? "asc" : sortOrder === "descend" ? "desc" : null,
                  }));
                }}
              page={experimentQuery.data?.page ?? filters.page}
              pageSize={experimentQuery.data?.page_size ?? filters.pageSize}
              sortField={filters.sortBy}
              sortOrder={filters.sortOrder === "asc" ? "ascend" : filters.sortOrder === "desc" ? "descend" : null}
              total={experimentQuery.data?.total ?? 0}
            />
          )}
        </div>
      </Card>
      <Modal
        cancelText="取消"
        confirmLoading={activeTransitionKey?.endsWith(":invalidate") ?? false}
        okText="确认作废"
        okType="danger"
        onCancel={closeInvalidateModal}
        onOk={() => {
          void submitInvalidate();
        }}
        open={Boolean(invalidateTarget)}
        title={invalidateTarget ? `作废实验 ${invalidateTarget.run_code}` : "作废实验"}
      >
        <div className="content-stack">
          <Input.TextArea
            aria-label="作废原因"
            autoSize={{ minRows: 3, maxRows: 5 }}
            disabled={activeTransitionKey?.endsWith(":invalidate") ?? false}
            onChange={(event) => {
              setInvalidateReason(event.target.value);
              if (invalidateValidation) {
                setInvalidateValidation(null);
              }
            }}
            placeholder="说明污染、设备异常或其他作废原因"
            value={invalidateReason}
          />
          {invalidateValidation ? <Alert title={invalidateValidation} showIcon type="error" /> : null}
        </div>
      </Modal>
    </div>
  );
}
