import type { ReactNode } from "react";
import { Space, Typography } from "antd";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        <Typography.Title level={2} style={{ marginBottom: 8, marginTop: 0 }}>
          {title}
        </Typography.Title>
        {subtitle ? (
          <Typography.Paragraph style={{ marginBottom: 0 }} type="secondary">
            {subtitle}
          </Typography.Paragraph>
        ) : null}
      </div>
      {actions ? (
        <Space align="center" wrap>
          {actions}
        </Space>
      ) : null}
    </div>
  );
}
