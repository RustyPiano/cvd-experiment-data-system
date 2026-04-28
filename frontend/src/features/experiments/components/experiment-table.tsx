import { Button, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "../../../shared/ui/empty-state";
import { QualityTag, StatusTag } from "../../../shared/ui/status-tag";
import type { ExperimentRead } from "../../../shared/types/api";
import type { ExperimentSortField } from "../api";

export type ExperimentSortOrder = "ascend" | "descend";

type ExperimentTableProps = {
  activeExportKey: string | null;
  items: ExperimentRead[];
  loading: boolean;
  onExportExcel: (experiment: ExperimentRead) => void;
  onExportJson: (experiment: ExperimentRead) => void;
  onTableChange: (
    page: number,
    pageSize: number,
    sortField: ExperimentSortField | null,
    sortOrder: ExperimentSortOrder | null,
  ) => void;
  page: number;
  pageSize: number;
  sortField: ExperimentSortField | null;
  sortOrder: ExperimentSortOrder | null;
  total: number;
};

const sortableFields = new Set<ExperimentSortField>([
  "run_code",
  "material_system",
  "experiment_date",
  "status",
  "updated_at",
]);

function isExperimentSortField(value: unknown): value is ExperimentSortField {
  return typeof value === "string" && sortableFields.has(value as ExperimentSortField);
}

export function ExperimentTable({
  activeExportKey,
  items,
  loading,
  onExportExcel,
  onExportJson,
  onTableChange,
  page,
  pageSize,
  sortField,
  sortOrder,
  total,
}: ExperimentTableProps) {
  const navigate = useNavigate();
  const resolveSortOrder = (field: ExperimentSortField) =>
    sortField === field && sortOrder ? sortOrder : null;

  const columns: ColumnsType<ExperimentRead> = [
    {
      title: "实验编号",
      dataIndex: "run_code",
      key: "run_code",
      sortOrder: resolveSortOrder("run_code"),
      sorter: true,
      render: (runCode: string, record) => (
        <Link to={`/experiments/${record.id}`}>{runCode}</Link>
      ),
    },
    {
      title: "材料体系",
      dataIndex: "material_system",
      key: "material_system",
      sortOrder: resolveSortOrder("material_system"),
      sorter: true,
      render: (value: string | null) =>
        value || <Typography.Text type="secondary">未填写</Typography.Text>,
    },
    {
      title: "质量标签",
      dataIndex: "quality_label",
      key: "quality_label",
      render: (value: ExperimentRead["quality_label"]) => <QualityTag label={value} />,
    },
    {
      title: "实验日期",
      dataIndex: "experiment_date",
      key: "experiment_date",
      sortOrder: resolveSortOrder("experiment_date"),
      sorter: true,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD"),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      sortOrder: resolveSortOrder("status"),
      sorter: true,
      render: (status: ExperimentRead["status"]) => <StatusTag status={status} />,
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
      sortOrder: resolveSortOrder("updated_at"),
      sorter: true,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "操作",
      key: "actions",
      render: (_, record) => (
        <Space size="small">
          <Button
            onClick={() => {
              navigate(`/experiments/${record.id}`);
            }}
            size="small"
            type="link"
          >
            查看
          </Button>
          {record.status === "draft" ? (
            <Button
              onClick={() => {
                navigate(`/experiments/${record.id}/edit`);
              }}
              size="small"
              type="link"
            >
              继续填写
            </Button>
          ) : null}
          <Button
            loading={activeExportKey === `${record.id}:json`}
            onClick={() => {
              onExportJson(record);
            }}
            size="small"
            type="link"
          >
            导出 JSON
          </Button>
          <Button
            loading={activeExportKey === `${record.id}:excel`}
            onClick={() => {
              onExportExcel(record);
            }}
            size="small"
            type="link"
          >
            导出 Excel
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table<ExperimentRead>
      columns={columns}
      dataSource={items}
      locale={{
        emptyText: <EmptyState description="当前没有可见实验记录。" />,
      }}
      loading={loading}
      onChange={(pagination, _filters, sorter) => {
        const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
        if (!activeSorter?.order) {
          onTableChange(
            pagination.current ?? page,
            pagination.pageSize ?? pageSize,
            null,
            null,
          );
          return;
        }

        const nextField = isExperimentSortField(activeSorter?.columnKey)
          ? activeSorter.columnKey
          : null;
        const nextOrder = activeSorter?.order === "ascend" ? "ascend" : "descend";

        onTableChange(
          pagination.current ?? page,
          pagination.pageSize ?? pageSize,
          nextField,
          nextOrder,
        );
      }}
      pagination={{
        current: page,
        pageSize,
        showSizeChanger: true,
        total,
      }}
      rowKey="id"
    />
  );
}
