import { useMemo, useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Input, Space, Typography } from "antd";
import { useNavigate, useSearchParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { triggerBlobDownload } from "../../shared/lib/download";
import { useDebounce } from "../../shared/lib/use-debounce";
import type { ExperimentRead, ExperimentStatus } from "../../shared/types/api";
import { PageHeader } from "../../shared/ui/page-header";
import { LoadingState } from "../../shared/ui/loading-state";
import {
  downloadExperimentExcel,
  exportExperimentJson,
  listExperiments,
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
  urlQ: string;
};

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
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const urlQ = searchParams.get("q") || "";

  const [filterState, setFilterState] = useState<ExperimentListFilterState>({
    filters: {
      ...defaultFilters,
      q: urlQ,
    },
    urlQ,
  });
  const filters = useMemo(
    () =>
      filterState.urlQ === urlQ
        ? filterState.filters
        : {
            ...filterState.filters,
            page: 1,
            q: urlQ,
          },
    [filterState, urlQ],
  );
  const setFilters = (
    updater: (current: ExperimentListFilters) => ExperimentListFilters,
  ) => {
    setFilterState((current) => {
      const currentFilters =
        current.urlQ === urlQ
          ? current.filters
          : {
              ...current.filters,
              page: 1,
              q: urlQ,
            };
      return {
        filters: updater(currentFilters),
        urlQ,
      };
    });
  };
  const [listActionError, setListActionError] = useState<string | null>(null);
  const [activeExportKey, setActiveExportKey] = useState<string | null>(null);
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

  const resetFilters = () => {
    setFilters(() => defaultFilters);
    setListActionError(null);
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
              items={experimentQuery.data?.items ?? []}
              loading={false}
              onExportExcel={(experiment) => {
                void handleExportExcel(experiment);
              }}
              onExportJson={(experiment) => {
                void handleExportJson(experiment);
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
    </div>
  );
}
