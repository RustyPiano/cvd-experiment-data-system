import { Skeleton } from "antd";

export function LoadingState() {
  return (
    <div className="loading-panel">
      <Skeleton active paragraph={{ rows: 4 }} title />
    </div>
  );
}
