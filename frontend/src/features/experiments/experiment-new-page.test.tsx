import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ExperimentNewPage } from "./experiment-new-page";
import { renderWithApp } from "../../test/render";

describe("ExperimentNewPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows an error message when creation fails", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Insufficient permissions" }), {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
    });

    await user.click(screen.getByRole("button", { name: "立即创建" }));

    expect(await screen.findByText("Insufficient permissions")).toBeInTheDocument();
  });

  it("shows a friendly message when there is no recent experiment to clone", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            page_size: 1,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      ),
    );

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
    });

    await user.click(screen.getByRole("button", { name: "复制最近一条" }));

    expect(await screen.findByText("最近没有可复制的已提交或已锁定实验。")).toBeInTheDocument();
  });

  it("opens history clone dialog and clones the selected experiment", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/experiments" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "exp-locked",
                run_code: "CVD-2026-0008",
                owner_id: "u-2",
                derived_from_run_id: null,
                derived_from_run_code: null,
                experiment_type: "cvd",
                material_system: "WS2",
                experiment_date: "2026-04-21",
                objective: "history clone",
                status: "locked",
                quality_label: "unknown",
                summary_result: null,
                invalid_reason: null,
                created_at: "2026-04-21T00:00:00Z",
                updated_at: "2026-04-23T00:00:00Z",
                submitted_at: "2026-04-22T00:00:00Z",
                locked_at: "2026-04-23T00:00:00Z",
              },
            ],
            total: 1,
            page: 1,
            page_size: 5,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.pathname === "/api/v1/experiments/exp-locked/clone" && method === "POST") {
        return new Response(
          JSON.stringify({
            id: "exp-clone",
            run_code: "CVD-2026-0010",
            owner_id: "u-1",
            derived_from_run_id: "exp-locked",
            derived_from_run_code: "CVD-2026-0008",
            experiment_type: "cvd",
            material_system: "WS2",
            experiment_date: "2026-04-24",
            objective: "history clone",
            status: "draft",
            quality_label: "unknown",
            summary_result: null,
            invalid_reason: null,
            created_at: "2026-04-24T00:00:00Z",
            updated_at: "2026-04-24T00:00:00Z",
            submitted_at: null,
            locked_at: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/new" element={<ExperimentNewPage />} />
        <Route path="/experiments/:experimentId/edit" element={<div>编辑器路由</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/new"],
      },
    );

    await user.click(screen.getByRole("button", { name: "打开历史实验" }));

    expect(await screen.findByText("CVD-2026-0008")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "复制这条" }));

    expect(await screen.findByText("编辑器路由")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("limits submitted history sources to the current user's experiments", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            page_size: 5,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
    });

    await user.click(screen.getByRole("button", { name: "打开历史实验" }));

    expect(await screen.findByRole("checkbox", { name: "已提交" })).toBeDisabled();
    expect(screen.getByText(/已提交实验仅在“只看我的实验”开启时可检索/)).toBeInTheDocument();
    const lockedCheckbox = screen.getByRole("checkbox", { name: "已锁定" });
    await user.click(lockedCheckbox);
    expect(lockedCheckbox).toBeChecked();
  });

  it("blocks viewer users before they can submit a create request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
      user: {
        id: "viewer-1",
        email: "viewer@example.com",
        name: "Viewer",
        role: "viewer",
        is_active: true,
        last_login_at: null,
      },
    });

    expect(await screen.findByText("当前账号没有创建实验权限。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "立即创建" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制最近一条" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开历史实验" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
