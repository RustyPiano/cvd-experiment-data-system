import type { ReactNode } from "react";
import { Empty, Space } from "antd";

type EmptyStateProps = {
  description: string;
  action?: ReactNode;
};

export function EmptyState({ description, action }: EmptyStateProps) {
  return (
    <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE}>
      {action ? <Space style={{ marginTop: 12 }}>{action}</Space> : null}
    </Empty>
  );
}
