import { MoreOutlined } from "@ant-design/icons";
import { Button, Dropdown, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import dayjs from "dayjs";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "../../../shared/ui/empty-state";
import { QualityTag, StatusTag } from "../../../shared/ui/status-tag";
import type { ExperimentRead } from "../../../shared/types/api";
import type { SessionUser } from "../../auth/auth-store";
import type { ExperimentSortField } from "../api";

export type ExperimentSortOrder = "ascend" | "descend";

type ExperimentTableProps = {
  activeExportKey: string | null;
  activeTransitionKey: string | null;
  currentUser: SessionUser | null;
  items: ExperimentRead[];
  loading: boolean;
  onExportExcel: (experiment: ExperimentRead) => void;
  onExportJson: (experiment: ExperimentRead) => void;
  onClone: (experiment: ExperimentRead) => void;
  onInvalidate: (experiment: ExperimentRead) => void;
  onLock: (experiment: ExperimentRead) => void;
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
  activeTransitionKey,
  currentUser,
  items,
  loading,
  onClone,
  onExportExcel,
  onExportJson,
  onInvalidate,
  onLock,
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

  const buildActionMenuItems = (record: ExperimentRead): MenuProps["items"] => {
    const isOwnerOrAdmin =
      currentUser?.role === "admin" || currentUser?.id === record.owner_id;
    const isOwner = currentUser?.id === record.owner_id;
    const canMutate = Boolean(currentUser && currentUser.role !== "viewer");
    const canInvalidate =
      canMutate && isOwnerOrAdmin && record.status !== "invalid" && record.status !== "locked";
    const canLock = canMutate && isOwnerOrAdmin && record.status === "submitted";
    const canClone =
      canMutate && (record.status === "locked" || (record.status === "submitted" && isOwner));

    if (record.status === "draft") {
      return [
        { key: "export-json", label: "导出 JSON" },
        { key: "export-excel", label: "导出 Excel" },
        ...(canInvalidate ? [{ key: "invalidate", label: "作废", danger: true }] : []),
      ];
    }

    if (record.status === "submitted") {
      return [
        ...(canLock ? [{ key: "lock", label: "锁定" }] : []),
        ...(canClone ? [{ key: "clone", label: "派生" }] : []),
        { key: "export-json", label: "导出 JSON" },
        { key: "export-excel", label: "导出 Excel" },
      ];
    }

    if (record.status === "locked") {
      return [
        ...(canClone ? [{ key: "clone", label: "派生" }] : []),
        { key: "export-json", label: "导出 JSON" },
        { key: "export-excel", label: "导出 Excel" },
      ];
    }

    return [{ key: "export-json", label: "导出 JSON" }];
  };

  const handleMenuAction = (record: ExperimentRead, key: string) => {
    if (key === "export-json") {
      onExportJson(record);
      return;
    }

    if (key === "export-excel") {
      onExportExcel(record);
      return;
    }

    if (key === "lock") {
      onLock(record);
      return;
    }

    if (key === "clone") {
      onClone(record);
      return;
    }

    if (key === "invalidate") {
      onInvalidate(record);
    }
  };

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
      render: (_, record) => {
        const isOwnerOrAdmin =
          currentUser?.role === "admin" || currentUser?.id === record.owner_id;
        const canEditDraft =
          currentUser?.role !== "viewer" && record.status === "draft" && isOwnerOrAdmin;
        const isTransitionBusy = activeTransitionKey?.startsWith(`${record.id}:`) ?? false;
        const primaryAction =
          canEditDraft
            ? {
                label: "继续填写",
                path: `/experiments/${record.id}/edit`,
              }
            : {
                label: "查看",
                path: `/experiments/${record.id}`,
              };

        return (
          <Space size="small">
            <Button
              aria-label={primaryAction.label}
              disabled={isTransitionBusy}
              onClick={() => {
                navigate(primaryAction.path);
              }}
              size="small"
              type="primary"
            >
              {primaryAction.label}
            </Button>
            <Dropdown
              menu={{
                items: buildActionMenuItems(record),
                onClick: ({ key }) => {
                  handleMenuAction(record, key);
                },
              }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <Button
                aria-label={`更多操作 ${record.run_code}`}
                disabled={isTransitionBusy}
                icon={<MoreOutlined />}
                loading={
                  isTransitionBusy || (activeExportKey?.startsWith(`${record.id}:`) ?? false)
                }
                size="small"
              />
            </Dropdown>
          </Space>
        );
      },
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
