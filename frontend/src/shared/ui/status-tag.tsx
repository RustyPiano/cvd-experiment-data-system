import { Tag } from "antd";

import type { ExperimentStatus, QualityLabel } from "../types/api";

const statusMeta: Record<ExperimentStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: "#F1F5F9", text: "#64748B", label: "草稿" },
  submitted: { bg: "#DBEAFE", text: "#2563EB", label: "已提交" },
  locked: { bg: "#DCFCE7", text: "#15803D", label: "已锁定" },
  invalid: { bg: "#FEE2E2", text: "#DC2626", label: "已作废" },
};

export function StatusTag({ status }: { status: ExperimentStatus }) {
  const meta = statusMeta[status];

  return (
    <Tag
      style={{
        backgroundColor: meta.bg,
        color: meta.text,
        borderColor: meta.bg,
        fontWeight: 600,
        fontSize: 12,
        padding: "2px 10px",
        borderRadius: 9999,
      }}
    >
      {meta.label}
    </Tag>
  );
}

const qualityMeta: Record<QualityLabel, { bg: string; text: string; label: string }> = {
  success: { bg: "#DCFCE7", text: "#15803D", label: "成功" },
  partial: { bg: "#FEF3C7", text: "#B45309", label: "部分成功" },
  failed: { bg: "#FEE2E2", text: "#DC2626", label: "失败" },
  unknown: { bg: "#F1F5F9", text: "#64748B", label: "未判断" },
};

export function QualityTag({ label }: { label: QualityLabel }) {
  const meta = qualityMeta[label];

  return (
    <Tag
      style={{
        backgroundColor: meta.bg,
        color: meta.text,
        borderColor: meta.bg,
        fontWeight: 600,
        fontSize: 12,
        padding: "2px 10px",
        borderRadius: 9999,
      }}
    >
      {meta.label}
    </Tag>
  );
}
