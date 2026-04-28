import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ExperimentNewPage } from "./experiment-new-page";
import { renderWithApp } from "../../test/render";
import type { ExperimentRead, RecipeRead } from "../../shared/types/api";

function buildExperiment(overrides: Partial<ExperimentRead> = {}): ExperimentRead {
  return {
    id: "exp-1",
    run_code: "CVD-2026-0001",
    owner_id: "u-1",
    derived_from_run_id: null,
    derived_from_run_code: null,
    recipe_id: null,
    experiment_type: "cvd",
    material_system: "MoS2",
    experiment_date: "2026-04-28",
    objective: null,
    status: "draft",
    quality_label: "unknown",
    summary_result: null,
    invalid_reason: null,
    created_at: "2026-04-28T00:00:00Z",
    updated_at: "2026-04-28T00:00:00Z",
    submitted_at: null,
    locked_at: null,
    ...overrides,
  };
}

function buildRecipe(overrides: Partial<RecipeRead> = {}): RecipeRead {
  return {
    id: "recipe-1",
    name: "MoS2 baseline",
    template_version_id: null,
    project_id: null,
    material_system: "MoS2",
    default_payload_json: {},
    description: "稳定生长窗口",
    created_by: "u-1",
    is_active: true,
    created_at: "2026-04-27T00:00:00Z",
    updated_at: "2026-04-27T00:00:00Z",
    ...overrides,
  };
}

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
                ...buildExperiment({
                  id: "exp-locked",
                  run_code: "CVD-2026-0008",
                  owner_id: "u-2",
                  material_system: "WS2",
                  experiment_date: "2026-04-21",
                  objective: "history clone",
                  status: "locked",
                  created_at: "2026-04-21T00:00:00Z",
                  updated_at: "2026-04-23T00:00:00Z",
                  submitted_at: "2026-04-22T00:00:00Z",
                  locked_at: "2026-04-23T00:00:00Z",
                }),
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
          JSON.stringify(
            buildExperiment({
              id: "exp-clone",
              run_code: "CVD-2026-0010",
              derived_from_run_id: "exp-locked",
              derived_from_run_code: "CVD-2026-0008",
              material_system: "WS2",
              objective: "history clone",
            }),
          ),
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

    await user.click(screen.getByRole("button", { name: "搜索历史实验" }));

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

    await user.click(screen.getByRole("button", { name: "搜索历史实验" }));

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
    expect(screen.queryByRole("button", { name: "搜索历史实验" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "选择 Recipe" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the recipe modal and displays active recipes grouped by material system", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/recipes" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              buildRecipe({ id: "recipe-1", name: "MoS2 baseline", material_system: "MoS2" }),
              buildRecipe({ id: "recipe-2", name: "WS2 growth", material_system: "WS2" }),
              buildRecipe({ id: "recipe-3", name: "General clean", material_system: null }),
            ],
            total: 3,
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

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
    });

    await user.click(screen.getByRole("button", { name: "选择 Recipe" }));

    expect(await screen.findByRole("heading", { name: "MoS2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "WS2" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "未分组" })).toBeInTheDocument();
    expect(screen.getByText("MoS2 baseline")).toBeInTheDocument();
    expect(screen.getByText("WS2 growth")).toBeInTheDocument();
    expect(screen.getByText("General clean")).toBeInTheDocument();
  });

  it("creates an experiment from a selected recipe and navigates to the editor", async () => {
    const user = userEvent.setup();
    const requests: Array<{ body: unknown; method: string; pathname: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";
      requests.push({
        body: init?.body ? JSON.parse(init.body.toString()) : null,
        method,
        pathname: url.pathname,
      });

      if (url.pathname === "/api/v1/recipes" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [buildRecipe({ id: "recipe-1", name: "MoS2 baseline" })],
            total: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.pathname === "/api/v1/experiments/from-recipe" && method === "POST") {
        return new Response(
          JSON.stringify(
            buildExperiment({
              id: "exp-from-recipe",
              run_code: "CVD-2026-0011",
              recipe_id: "recipe-1",
            }),
          ),
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

    await user.click(screen.getByRole("button", { name: "选择 Recipe" }));
    await user.click(await screen.findByRole("button", { name: "使用 MoS2 baseline" }));

    expect(await screen.findByText("编辑器路由")).toBeInTheDocument();
    expect(requests).toContainEqual({
      method: "POST",
      pathname: "/api/v1/experiments/from-recipe",
      body: {
        recipe_id: "recipe-1",
        experiment_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      },
    });
  });

  it("shows recipe creation errors inside the still-open recipe modal", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/recipes" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [buildRecipe({ id: "recipe-1", name: "MoS2 baseline" })],
            total: 1,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (url.pathname === "/api/v1/experiments/from-recipe" && method === "POST") {
        return new Response(JSON.stringify({ detail: "Recipe create blocked" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
    });

    await user.click(screen.getByRole("button", { name: "选择 Recipe" }));
    const dialog = await screen.findByRole("dialog", { name: "从 Recipe 创建实验" });
    await user.click(await within(dialog).findByRole("button", { name: "使用 MoS2 baseline" }));

    expect(await within(dialog).findByText("Recipe create blocked")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "从 Recipe 创建实验" })).toBeInTheDocument();
  });

  it("shows an empty state when there are no active recipes", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: [], total: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
    });

    await user.click(screen.getByRole("button", { name: "选择 Recipe" }));

    expect(await screen.findByText("当前没有可用的 Recipe。")).toBeInTheDocument();
  });

  it("shows an error when active recipes fail to load", async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Recipe service unavailable" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    renderWithApp(<ExperimentNewPage />, {
      authenticated: true,
      initialEntries: ["/experiments/new"],
    });

    await user.click(screen.getByRole("button", { name: "选择 Recipe" }));

    expect(await screen.findByText("Recipe service unavailable")).toBeInTheDocument();
  });

  it("does not fetch recipes for viewer users", async () => {
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
    expect(screen.queryByRole("button", { name: "选择 Recipe" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
