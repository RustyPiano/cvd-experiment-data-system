import { Typography } from "antd";

import type { DashboardTrendPoint } from "../../../shared/types/api";

type TrendBarsProps = {
  data: DashboardTrendPoint[];
};

export function TrendBars({ data }: TrendBarsProps) {
  const maxCount = Math.max(...data.map((point) => point.count), 1);

  return (
    <div aria-label="记录趋势" className="admin-dashboard-trend" role="img">
      <div className="admin-dashboard-trend-bars">
        {data.map((point) => {
          const height = `${Math.max((point.count / maxCount) * 100, point.count > 0 ? 8 : 2)}%`;
          return (
            <div className="admin-dashboard-trend-item" key={point.period}>
              <div className="admin-dashboard-trend-track">
                <div
                  className="admin-dashboard-trend-bar"
                  style={{ height }}
                  title={`${point.period}: ${point.count}`}
                />
              </div>
              <Typography.Text className="admin-dashboard-trend-label" type="secondary">
                {point.period.replace(/^\d{4}-/, "")}
              </Typography.Text>
            </div>
          );
        })}
      </div>
    </div>
  );
}
