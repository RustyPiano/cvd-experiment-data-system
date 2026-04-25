import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, App, Button, Checkbox, Input, Modal, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";

import { HttpError } from "../../../shared/api/http-error";
import type { ExperimentRead, ExperimentStatus } from "../../../shared/types/api";
import { EmptyState } from "../../../shared/ui/empty-state";
import { StatusTag } from "../../../shared/ui/status-tag";
import { cloneExperiment, listExperiments } from "../api";

type HistoryCloneDialogProps = {
  accessToken: string;
  currentUserId: string;
  onCancel: () => void;
  onCloned: (experiment: ExperimentRead) => void;
  open: boolean;
};

type HistoryFilters = {
  materialSystem: string;
  mine: boolean;
  page: number;
  pageSize: number;
  q: string;
  status: ExperimentStatus[];
};

const defaultFilters: HistoryFilters = {
  materialSystem: "",
  mine: false,
  page: 1,
  pageSize: 5,
  q: "",
  status: ["locked"],
};

function normalizeHistoryStatus(
  status: ExperimentStatus[],
  mine: boolean,
): ExperimentStatus[] {
  const allowedStatuses = mine ? status : status.filter((value) => value !== "submitted");
  return allowedStatuses.length > 0 ? allowedStatuses : (["locked"] as ExperimentStatus[]);
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

export function HistoryCloneDialog({
  accessToken,
  currentUserId,
  onCancel,
  onCloned,
  open,
}: HistoryCloneDialogProps) {
  const { message } = App.useApp();
  const [draftFilters, setDraftFilters] = useState<HistoryFilters>(defaultFilters);
  const [filters, setFilters] = useState<HistoryFilters>(defaultFilters);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeCloneId, setActiveCloneId] = useState<string | null>(null);

  const experimentsQuery = useQuery({
    queryKey: ["experiments", "history-clone", currentUserId, filters],
    queryFn: () =>
      listExperiments(accessToken, {
        mine: filters.mine,
        status: filters.status,
        materialSystem: filters.materialSystem || null,
        q: filters.q || null,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
    enabled: open,
  });

  const cloneMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      setActiveCloneId(experimentId);
      return cloneExperiment(accessToken, experimentId);
    },
    onSuccess: (experiment) => {
      setActionError(null);
      message.success("实验复制成功");
      onCloned(experiment);
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, "复制历史实验失败"));
    },
    onSettled: () => {
      setActiveCloneId(null);
    },
  });

  const columns = useMemo<ColumnsType<ExperimentRead>>(
    () => [
      {
        title: "实验编号",
        dataIndex: "run_code",
        key: "run_code",
        render: (value: string, record) => (
          <Space orientation="vertical" size={0}>
            <Typography.Text strong>{value}</Typography.Text>
            {record.derived_from_run_code ? <Tag color="blue">派生自 {record.derived_from_run_code}</Tag> : null}
          </Space>
        ),
      },
      {
        title: "材料体系",
        dataIndex: "material_system",
        key: "material_system",
        render: (value: string | null) => value || <Typography.Text type="secondary">未填写</Typography.Text>,
      },
      {
        title: "实验日期",
        dataIndex: "experiment_date",
        key: "experiment_date",
        render: (value: string) => dayjs(value).format("YYYY-MM-DD"),
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        render: (status: ExperimentStatus) => <StatusTag status={status} />,
      },
      {
        title: "操作",
        key: "actions",
        render: (_, record) => (
          <Button
            loading={activeCloneId === record.id}
            onClick={() => {
              setActionError(null);
              cloneMutation.mutate(record.id);
            }}
            size="small"
            type="primary"
          >
            复制这条
          </Button>
        ),
      },
    ],
    [activeCloneId, cloneMutation],
  );

  const submittedEnabled = draftFilters.mine;

  const applyFilters = () => {
    const normalizedStatus = normalizeHistoryStatus(draftFilters.status, draftFilters.mine);
    setFilters({
      ...draftFilters,
      materialSystem: draftFilters.materialSystem.trim(),
      page: 1,
      q: draftFilters.q.trim(),
      status: normalizedStatus,
    });
    setDraftFilters((current) => ({
      ...current,
      status: normalizedStatus,
    }));
  };

  const resetFilters = () => {
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
    setActionError(null);
  };

  return (
    <Modal
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
      open={open}
      title="从历史实验复制"
      width={960}
    >
      <div className="content-stack">
        <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
          可复制范围与后端权限一致：自己的已提交/已锁定实验，以及其他人已锁定实验。
          已提交实验仅在“只看我的实验”开启时可检索。
        </Typography.Paragraph>

        <Space align="start" size={12} wrap>
          <Input
            allowClear
            aria-label="历史实验搜索"
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
            aria-label="历史实验材料体系"
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
              const nextMine = event.target.checked;
              setDraftFilters((current) => ({
                ...current,
                mine: nextMine,
                status: normalizeHistoryStatus(current.status, nextMine),
              }));
            }}
          >
            只看我的实验
          </Checkbox>
          <Checkbox.Group
            onChange={(checkedValues) => {
              const normalizedStatus = normalizeHistoryStatus(
                checkedValues as ExperimentStatus[],
                draftFilters.mine,
              );
              setDraftFilters((current) => ({
                ...current,
                status: normalizedStatus,
              }));
            }}
            options={[
              { disabled: !submittedEnabled, label: "已提交", value: "submitted" },
              { label: "已锁定", value: "locked" },
            ]}
            value={draftFilters.status}
          />
          <Button onClick={applyFilters} type="primary">
            应用筛选
          </Button>
          <Button onClick={resetFilters}>重置</Button>
        </Space>

        {actionError ? <Alert title={actionError} showIcon type="error" /> : null}
        {experimentsQuery.isError ? (
          <Alert
            title={resolveErrorMessage(experimentsQuery.error, "历史实验加载失败")}
            showIcon
            type="error"
          />
        ) : null}

        <Table<ExperimentRead>
          columns={columns}
          dataSource={experimentsQuery.data?.items ?? []}
          loading={experimentsQuery.isLoading}
          locale={{
            emptyText: (
              <EmptyState description="当前筛选条件下没有可复制的历史实验。" />
            ),
          }}
          onChange={(pagination) => {
            setDraftFilters((current) => ({
              ...current,
              page: pagination.current ?? current.page,
              pageSize: pagination.pageSize ?? current.pageSize,
            }));
            setFilters((current) => ({
              ...current,
              page: pagination.current ?? current.page,
              pageSize: pagination.pageSize ?? current.pageSize,
            }));
          }}
          pagination={{
            current: experimentsQuery.data?.page ?? filters.page,
            pageSize: experimentsQuery.data?.page_size ?? filters.pageSize,
            showSizeChanger: true,
            total: experimentsQuery.data?.total ?? 0,
          }}
          rowKey="id"
        />
      </div>
    </Modal>
  );
}
