import { Collapse, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";

import {
  getDiffStatusLabel,
  type DiffRow,
  type DiffStatus,
  type ModuleDiff,
} from "../diff-utils";

const statusColors: Record<DiffStatus, string> = {
  added: "blue",
  modified: "gold",
  removed: "red",
  same: "default",
};

function formatDiffValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return <Typography.Text type="secondary">-</Typography.Text>;
  }

  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return (
    <Typography.Text code style={{ whiteSpace: "pre-wrap" }}>
      {JSON.stringify(value, null, 2)}
    </Typography.Text>
  );
}

function renderStatusTag(status: DiffStatus) {
  return <Tag color={statusColors[status]}>{getDiffStatusLabel(status)}</Tag>;
}

const columns: ColumnsType<DiffRow> = [
  {
    dataIndex: "label",
    key: "label",
    title: "字段名",
    width: 220,
  },
  {
    dataIndex: "sourceValue",
    key: "sourceValue",
    render: formatDiffValue,
    title: "来源值",
  },
  {
    dataIndex: "currentValue",
    key: "currentValue",
    render: formatDiffValue,
    title: "当前值",
  },
  {
    dataIndex: "status",
    key: "status",
    render: renderStatusTag,
    title: "状态",
    width: 110,
  },
];

export function DiffSection({
  collapseSame,
  moduleDiff,
}: {
  collapseSame: boolean;
  moduleDiff: ModuleDiff;
}) {
  const rows = collapseSame
    ? moduleDiff.rows.filter((row) => row.status !== "same")
    : moduleDiff.rows;
  const visibleRows = rows.length > 0 ? rows : moduleDiff.rows;
  const isSame = moduleDiff.status === "same";

  return (
    <Collapse
      defaultActiveKey={isSame && collapseSame ? [] : [moduleDiff.moduleKey]}
      items={[
        {
          key: moduleDiff.moduleKey,
          label: (
            <span>
              {moduleDiff.moduleLabel} {renderStatusTag(moduleDiff.status)}
            </span>
          ),
          children: (
            <Table
              columns={columns}
              dataSource={visibleRows}
              pagination={false}
              rowKey="key"
              size="small"
            />
          ),
        },
      ]}
      size="small"
    />
  );
}
