import type { ReactNode } from "react";
import { Alert, Card, Tag, Typography } from "antd";

import type { SectionSaveState } from "../editor-types";

const saveStateMeta = {
  idle: { color: "default", label: "待保存" },
  saving: { color: "processing", label: "保存中" },
  saved: { color: "success", label: "已保存" },
  error: { color: "error", label: "保存失败" },
} as const;

export function EditorSectionCard({
  children,
  state,
  subtitle,
  title,
}: {
  children: ReactNode;
  state: SectionSaveState;
  subtitle: string;
  title: string;
}) {
  const meta = saveStateMeta[state.status];

  return (
    <Card>
      <div className="editor-section-header">
        <div>
          <Typography.Title level={4} style={{ marginBottom: 4, marginTop: 0 }}>
            {title}
          </Typography.Title>
          <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
            {subtitle}
          </Typography.Paragraph>
        </div>
        <Tag color={meta.color}>{meta.label}</Tag>
      </div>
      {state.status === "error" && state.message ? (
        <Alert
          title={state.message}
          showIcon
          style={{ marginBottom: 16 }}
          type="error"
        />
      ) : null}
      {children}
    </Card>
  );
}
