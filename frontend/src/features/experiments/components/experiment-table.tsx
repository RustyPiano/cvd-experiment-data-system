import { Button, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "../../../shared/ui/empty-state";
import { StatusTag } from "../../../shared/ui/status-tag";
import type { ExperimentRead } from "../../../shared/types/api";

type ExperimentTableProps = {
  items: ExperimentRead[];
  loading: boolean;
};

export function ExperimentTable({ items, loading }: ExperimentTableProps) {
  const navigate = useNavigate();

  const columns: ColumnsType<ExperimentRead> = [
    {
      title: "实验编号",
      dataIndex: "run_code",
      key: "run_code",
      render: (runCode: string, record) => (
        <Link to={`/experiments/${record.id}`}>{runCode}</Link>
      ),
    },
    {
      title: "材料体系",
      dataIndex: "material_system",
      key: "material_system",
      render: (value: string | null) =>
        value || <Typography.Text type="secondary">未填写</Typography.Text>,
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
      render: (status: ExperimentRead["status"]) => <StatusTag status={status} />,
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      key: "updated_at",
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
      pagination={{ pageSize: 20, showSizeChanger: true }}
      rowKey="id"
    />
  );
}
