import { Tag } from "antd";

import type { ExperimentStatus } from "../types/api";

const statusMeta: Record<ExperimentStatus, { color: string; label: string }> = {
  draft: { color: "default", label: "草稿" },
  submitted: { color: "processing", label: "已提交" },
  locked: { color: "success", label: "已锁定" },
  invalid: { color: "error", label: "已作废" },
};

export function StatusTag({ status }: { status: ExperimentStatus }) {
  const meta = statusMeta[status];

  return <Tag color={meta.color}>{meta.label}</Tag>;
}
