import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useLocation } from "react-router-dom";

import { renderWithApp } from "../../test/render";
import { AdminDashboardPage } from "./admin-dashboard-page";

function LocationProbe() {
  const location = useLocation();
  return <div>{`${location.pathname}${location.search}`}</div>;
}

function dashboardResponse() {
  return {
    totals: {
      total: 4,
      draft: 1,
      submitted: 1,
      locked: 1,
      invalid: 1,
      this_week_new: 3,
    },
    members: [
      {
        user_id: "member-1",
        name: "Active User",
        email: "active@example.com",
        role: "member",
        is_active: true,
        total: 2,
        draft: 1,
        submitted: 1,
        locked: 0,
        invalid: 0,
        stale_draft_count: 1,
        last_activity_at: "2026-05-31T00:00:00Z",
      },
      {
        user_id: "admin-1",
        name: "Admin User",
        email: "admin@example.com",
        role: "admin",
        is_active: true,
        total: 1,
        draft: 0,
        submitted: 0,
        locked: 1,
        invalid: 0,
        stale_draft_count: 0,
        last_activity_at: "2026-05-30T00:00:00Z",
      },
    ],
    trend: [
      {
        period: "2026-W21",
        week_start: "2026-05-18",
        count: 1,
      },
      {
        period: "2026-W22",
        week_start: "2026-05-25",
        count: 2,
      },
    ],
  };
}

describe("AdminDashboardPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders overview stats and navigates to owner-filtered experiments", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);
        return new Response(JSON.stringify(dashboardResponse()), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }),
    );

    renderWithApp(
      <Routes>
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/experiments" element={<LocationProbe />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/admin/dashboard"],
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(await screen.findByText("数据看板")).toBeInTheDocument();
    expect(screen.getByText("总记录")).toBeInTheDocument();
    expect(screen.getByText("本周新增")).toBeInTheDocument();
    expect(screen.getByText("Active User")).toBeInTheDocument();
    expect(screen.getByText("停滞 1")).toBeInTheDocument();
    expect(screen.getByLabelText("记录趋势")).toBeInTheDocument();

    await waitFor(() => {
      expect(requests).toContain("/api/v1/admin/dashboard/overview?trend_weeks=12&stale_days=14");
    });

    const row = screen.getByText("Active User").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    expect(
      await screen.findByText("/experiments?owner=member-1&ownerName=Active+User"),
    ).toBeInTheDocument();
  });
});
