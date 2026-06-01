import { apiRequest } from "../../shared/api/client";
import type { DashboardOverview } from "../../shared/types/api";

type DashboardOverviewParams = {
  trendWeeks?: number;
  staleDays?: number;
};

function buildQueryString(params: Record<string, number | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.set(key, String(value));
    }
  }

  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
}

export function getDashboardOverview(
  accessToken: string,
  params: DashboardOverviewParams = {},
): Promise<DashboardOverview> {
  return apiRequest<DashboardOverview>(
    `/api/v1/admin/dashboard/overview${buildQueryString({
      trend_weeks: params.trendWeeks ?? 12,
      stale_days: params.staleDays ?? 14,
    })}`,
    {
      token: accessToken,
    },
  );
}
