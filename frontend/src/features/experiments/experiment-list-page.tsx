import { useState } from "react";
import { PlusOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Card, Checkbox, Input, Space, Spin, Typography } from "antd";
import { useNavigate } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { triggerBlobDownload } from "../../shared/lib/download";
import type { ExperimentRead, ExperimentStatus } from "../../shared/types/api";
import { PageHeader } from "../../shared/ui/page-header";
import {
  downloadExperimentExcel,
  exportExperimentJson,
  listExperiments,
} from "./api";
import { ExperimentTable } from "./components/experiment-table";
import { useAuth } from "../auth/use-auth";

type ExperimentListFilters = {
  materialSystem: string;
  mine: boolean;
  page: number;
  pageSize: number;
  q: string;
  status: ExperimentStatus[];
};

const defaultFilters: ExperimentListFilters = {
  materialSystem: "",
  mine: false,
  page: 1,
  pageSize: 10,
  q: "",
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
  const { session } = useAuth();
  const [draftFilters, setDraftFilters] = useState<ExperimentListFilters>(defaultFilters);
  const [filters, setFilters] = useState<ExperimentListFilters>(defaultFilters);
  const [listActionError, setListActionError] = useState<string | null>(null);
  const [activeExportKey, setActiveExportKey] = useState<string | null>(null);
  const canCreateExperiment = session.currentUser?.role !== "viewer";

  const experimentQuery = useQuery({
    queryKey: ["experiments", "list", session.currentUser?.id ?? "anonymous", filters],
    queryFn: () =>
      listExperiments(session.accessToken!, {
        mine: filters.mine,
        status: filters.status,
        materialSystem: filters.materialSystem || null,
        page: filters.page,
        pageSize: filters.pageSize,
        q: filters.q || null,
      }),
    enabled: session.isAuthenticated,
  });

  const applyFilters = () => {
    setFilters({
      ...draftFilters,
      materialSystem: draftFilters.materialSystem.trim(),
      page: 1,
      q: draftFilters.q.trim(),
    });
  };

  const resetFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
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
          message={resolveErrorMessage(experimentQuery.error, "实验列表加载失败")}
          showIcon
          type="error"
        />
      ) : null}
      {listActionError ? <Alert message={listActionError} showIcon type="error" /> : null}

      <Card>
        <div className="content-stack">
          <Space align="start" size={12} wrap>
            <Input
              allowClear
              aria-label="实验搜索"
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  q: event.target.value,
                }));
              }}
              onPressEnter={applyFilters}
              placeholder="搜索实验编号、材料体系或目标"
              style={{ width: 280 }}
              value={draftFilters.q}
            />
            <Input
              allowClear
              aria-label="材料体系筛选"
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  materialSystem: event.target.value,
                }));
              }}
              onPressEnter={applyFilters}
              placeholder="材料体系筛选"
              style={{ width: 180 }}
              value={draftFilters.materialSystem}
            />
            <Checkbox
              checked={draftFilters.mine}
              onChange={(event) => {
                setDraftFilters((current) => ({
                  ...current,
                  mine: event.target.checked,
                }));
              }}
            >
              我的实验
            </Checkbox>
            <Checkbox.Group
              onChange={(checkedValues) => {
                setDraftFilters((current) => ({
                  ...current,
                  status: checkedValues as ExperimentStatus[],
                }));
              }}
              options={[
                { label: "草稿", value: "draft" },
                { label: "已提交", value: "submitted" },
                { label: "已锁定", value: "locked" },
                { label: "已作废", value: "invalid" },
              ]}
              value={draftFilters.status}
            />
            <Button onClick={applyFilters} type="primary">
              应用筛选
            </Button>
            <Button onClick={resetFilters}>重置</Button>
          </Space>

          <Typography.Text type="secondary">
            当前共 {experimentQuery.data?.total ?? 0} 条记录，支持列表内直接导出 JSON / Excel。
          </Typography.Text>

          {experimentQuery.isLoading ? (
            <div className="centered-panel">
              <Spin />
            </div>
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
              onPageChange={(page, pageSize) => {
                setDraftFilters((current) => ({
                  ...current,
                  page,
                  pageSize,
                }));
                setFilters((current) => ({
                  ...current,
                  page,
                  pageSize,
                }));
              }}
              page={experimentQuery.data?.page ?? filters.page}
              pageSize={experimentQuery.data?.page_size ?? filters.pageSize}
              total={experimentQuery.data?.total ?? 0}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
