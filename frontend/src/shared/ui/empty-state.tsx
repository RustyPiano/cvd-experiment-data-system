import { Empty } from "antd";

type EmptyStateProps = {
  description: string;
};

export function EmptyState({ description }: EmptyStateProps) {
  return <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
}
