import { useMemo } from "react";
import { Alert, Card, Col, Row, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import relativeTime from "dayjs/plugin/relativeTime";
import { useNavigate } from "react-router-dom";

import type { DashboardMemberStat } from "../../shared/types/api";
import { EmptyState } from "../../shared/ui/empty-state";
import { LoadingState } from "../../shared/ui/loading-state";
import { PageHeader } from "../../shared/ui/page-header";
import { useAuth } from "../auth/use-auth";
import { getDashboardOverview } from "./api";
import { TrendBars } from "./components/trend-bars";

dayjs.extend(relativeTime);
dayjs.locale("zh-cn");

const roleLabels: Record<DashboardMemberStat["role"], string> = {
  admin: "管理员",
  member: "成员",
  viewer: "查看者",
};

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const isAdmin = session.currentUser?.role === "admin";

  const overviewQuery = useQuery({
    queryKey: ["admin", "dashboard", "overview", session.currentUser?.id ?? "anonymous"],
    queryFn: () => getDashboardOverview(session.accessToken!),
    enabled: session.isAuthenticated && isAdmin,
  });

  const columns = useMemo<ColumnsType<DashboardMemberStat>>(
    () => [
      {
        title: "成员",
        key: "member",
        render: (_, member) => (
          <Space direction="vertical" size={0}>
            <Space size={8} wrap>
              <Typography.Text strong>{member.name}</Typography.Text>
              <Tag>{roleLabels[member.role]}</Tag>
              {member.is_active ? null : <Tag color="default">已停用</Tag>}
            </Space>
            <Typography.Text type="secondary">{member.email}</Typography.Text>
          </Space>
        ),
        sorter: (a, b) => a.name.localeCompare(b.name),
      },
      {
        title: "记录数",
        dataIndex: "total",
        key: "total",
        sorter: (a, b) => a.total - b.total,
      },
      {
        title: "草稿",
        dataIndex: "draft",
        key: "draft",
        sorter: (a, b) => a.draft - b.draft,
      },
      {
        title: "提交",
        dataIndex: "submitted",
        key: "submitted",
        sorter: (a, b) => a.submitted - b.submitted,
      },
      {
        title: "锁定",
        dataIndex: "locked",
        key: "locked",
        sorter: (a, b) => a.locked - b.locked,
      },
      {
        title: "作废",
        dataIndex: "invalid",
        key: "invalid",
        sorter: (a, b) => a.invalid - b.invalid,
      },
      {
        title: "最近活动",
        dataIndex: "last_activity_at",
        key: "last_activity_at",
        render: (value: string | null) =>
          value ? dayjs(value).fromNow() : <Typography.Text type="secondary">暂无</Typography.Text>,
        sorter: (a, b) =>
          dayjs(a.last_activity_at ?? 0).valueOf() - dayjs(b.last_activity_at ?? 0).valueOf(),
      },
      {
        title: "停滞草稿",
        dataIndex: "stale_draft_count",
        key: "stale_draft_count",
        render: (value: number) =>
          value > 0 ? <Tag color="warning">停滞 {value}</Tag> : <Typography.Text>0</Typography.Text>,
        sorter: (a, b) => a.stale_draft_count - b.stale_draft_count,
      },
    ],
    [],
  );

  if (overviewQuery.isLoading) {
    return <LoadingState />;
  }

  if (overviewQuery.isError) {
    return (
      <Alert
        title="管理员数据看板加载失败"
        showIcon
        type="error"
      />
    );
  }

  const overview = overviewQuery.data;

  return (
    <div className="content-stack">
      <PageHeader
        subtitle="查看全员实验记录数量、流程状态、停滞草稿与近期录入趋势。"
        title="数据看板"
      />

      <Row gutter={[16, 16]}>
        <Col lg={4} md={8} sm={12} xs={24}>
          <Card>
            <Statistic title="总记录" value={overview?.totals.total ?? 0} />
          </Card>
        </Col>
        <Col lg={4} md={8} sm={12} xs={24}>
          <Card>
            <Statistic title="草稿" value={overview?.totals.draft ?? 0} />
          </Card>
        </Col>
        <Col lg={4} md={8} sm={12} xs={24}>
          <Card>
            <Statistic title="待审" value={overview?.totals.submitted ?? 0} />
          </Card>
        </Col>
        <Col lg={4} md={8} sm={12} xs={24}>
          <Card>
            <Statistic title="已锁定" value={overview?.totals.locked ?? 0} />
          </Card>
        </Col>
        <Col lg={4} md={8} sm={12} xs={24}>
          <Card>
            <Statistic title="已作废" value={overview?.totals.invalid ?? 0} />
          </Card>
        </Col>
        <Col lg={4} md={8} sm={12} xs={24}>
          <Card>
            <Statistic title="本周新增" value={overview?.totals.this_week_new ?? 0} />
          </Card>
        </Col>
      </Row>

      <Card title="最近 12 周记录趋势">
        {overview?.trend.length ? (
          <TrendBars data={overview.trend} />
        ) : (
          <EmptyState description="暂无趋势数据" />
        )}
      </Card>

      <Card title="成员记录情况">
        <Table<DashboardMemberStat>
          columns={columns}
          dataSource={overview?.members ?? []}
          locale={{
            emptyText: <EmptyState description="暂无成员数据" />,
          }}
          onRow={(member) => ({
            onClick: () => {
              const params = new URLSearchParams({
                owner: member.user_id,
                ownerName: member.name,
              });
              navigate(`/experiments?${params.toString()}`);
            },
          })}
          pagination={false}
          rowClassName="admin-dashboard-member-row"
          rowKey="user_id"
          scroll={{ x: 920 }}
        />
      </Card>
    </div>
  );
}
