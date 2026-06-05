import type { ReactNode } from "react";
import { Alert, Card, Typography } from "antd";

import type { SectionSaveState } from "../editor-types";

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
  const shouldShowSavedWarning =
    state.status === "saved" &&
    Boolean(state.message) &&
    !["已自动保存", "Setup 已确认", "已套用模板"].includes(state.message ?? "");

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
      </div>
      {state.status === "error" && state.message ? (
        <Alert
          title={state.message}
          showIcon
          style={{ marginBottom: 16 }}
          type="error"
        />
      ) : null}
      {shouldShowSavedWarning ? (
        <Alert
          title={state.message}
          showIcon
          style={{ marginBottom: 16 }}
          type="warning"
        />
      ) : null}
      {children}
    </Card>
  );
}
