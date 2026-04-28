import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes, useNavigate } from "react-router-dom";

import { ExperimentListPage } from "./experiment-list-page";
import { ExperimentTable } from "./components/experiment-table";
import { renderWithApp } from "../../test/render";
import type { ExperimentRead } from "../../shared/types/api";

function createExperimentFixture(
  overrides: Partial<ExperimentRead> = {},
): ExperimentRead {
  return {
    id: "exp-1",
    run_code: "CVD-2026-0001",
    owner_id: "u-1",
    derived_from_run_id: null,
    derived_from_run_code: null,
    recipe_id: null,
    experiment_type: "cvd",
    material_system: "MoS2",
    experiment_date: "2026-04-23",
    objective: "baseline",
    status: "draft",
    quality_label: "unknown",
    summary_result: null,
    invalid_reason: null,
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
    submitted_at: null,
    locked_at: null,
    ...overrides,
  };
}

function createExperimentListResponse(
  items: ExperimentRead[] = [],
  options: { page?: number; pageSize?: number; total?: number } = {},
) {
  return {
    items,
    total: options.total ?? items.length,
    page: options.page ?? 1,
    page_size: options.pageSize ?? 10,
  };
}

function ExperimentListPageWithUrlControls() {
  const navigate = useNavigate();

  return (
    <>
      <button
        onClick={() => {
          navigate("/experiments");
        }}
        type="button"
      >
        清空地址栏筛选
      </button>
      <button
        onClick={() => {
          navigate(-1);
        }}
        type="button"
      >
        返回上一页
      </button>
      <ExperimentListPage />
    </>
  );
}

function openRowActions(runCode: string) {
  const row = screen.getByText(runCode).closest("tr");
  expect(row).not.toBeNull();
  fireEvent.click(within(row!).getByRole("button", { name: `更多操作 ${runCode}` }));
  return row!;
}

describe("ExperimentListPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders experiment rows from the backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "exp-1",
                run_code: "CVD-2026-0001",
                owner_id: "u-1",
                derived_from_run_id: null,
                derived_from_run_code: null,
                experiment_type: "cvd",
                material_system: "MoS2",
                experiment_date: "2026-04-23",
                objective: "baseline",
                status: "draft",
                quality_label: "unknown",
                summary_result: null,
                invalid_reason: null,
                created_at: "2026-04-23T00:00:00Z",
                updated_at: "2026-04-23T00:00:00Z",
                submitted_at: null,
                locked_at: null,
              },
            ],
            total: 1,
            page: 1,
            page_size: 10,
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

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    expect((await screen.findAllByText("CVD-2026-0001")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("MoS2").length).toBeGreaterThan(0);
    expect(screen.getByText(/当前共/i)).toBeInTheDocument();
  });

  it("shows draft quick actions with continue as primary and export plus invalidate in the menu", () => {
    renderWithApp(
      <ExperimentTable
        activeExportKey={null}
        activeTransitionKey={null}
        currentUser={{
          id: "u-1",
          email: "member@example.com",
          name: "Member",
          role: "member",
          is_active: true,
          last_login_at: null,
        }}
        items={[
          createExperimentFixture({
            id: "draft-exp",
            run_code: "CVD-2026-0001",
            status: "draft",
          }),
        ]}
        loading={false}
        onClone={vi.fn()}
        onExportExcel={vi.fn()}
        onExportJson={vi.fn()}
        onInvalidate={vi.fn()}
        onLock={vi.fn()}
        onTableChange={vi.fn()}
        page={1}
        pageSize={10}
        sortField={null}
        sortOrder={null}
        total={1}
      />,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
      },
    );

    const row = screen.getByText("CVD-2026-0001").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByRole("button", { name: "继续填写" })).toBeInTheDocument();
    expect(within(row!).queryByRole("button", { name: "查看" })).not.toBeInTheDocument();

    openRowActions("CVD-2026-0001");

    expect(screen.getByText("导出 JSON")).toBeInTheDocument();
    expect(screen.getByText("导出 Excel")).toBeInTheDocument();
    expect(screen.getByText("作废")).toBeInTheDocument();
    expect(screen.queryByText("锁定")).not.toBeInTheDocument();
    expect(screen.queryByText("派生")).not.toBeInTheDocument();
  });

  it("locks a submitted experiment from the quick action menu and refreshes the list", async () => {
    const requests: Array<{ method: string; pathname: string }> = [];
    let locked = false;
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        const method = init?.method ?? "GET";
        requests.push({ method, pathname: url.pathname });

        if (method === "POST" && url.pathname === "/api/v1/experiments/submitted-exp/lock") {
          locked = true;
          return new Response(
            JSON.stringify(
              createExperimentFixture({
                id: "submitted-exp",
                run_code: "CVD-2026-0002",
                status: "locked",
                submitted_at: "2026-04-23T01:00:00Z",
                locked_at: "2026-04-23T02:00:00Z",
              }),
            ),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          pageSize === 10
            ? [
                createExperimentFixture({
                  id: "submitted-exp",
                  run_code: "CVD-2026-0002",
                  status: locked ? "locked" : "submitted",
                  submitted_at: "2026-04-23T01:00:00Z",
                  locked_at: locked ? "2026-04-23T02:00:00Z" : null,
                }),
              ]
            : [];

        return new Response(
          JSON.stringify(createExperimentListResponse(items, { pageSize })),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    await screen.findByText("CVD-2026-0002");
    openRowActions("CVD-2026-0002");
    fireEvent.click(screen.getByText("锁定"));

    await waitFor(() => {
      expect(requests).toContainEqual({
        method: "POST",
        pathname: "/api/v1/experiments/submitted-exp/lock",
      });
    });
    expect(window.confirm).toHaveBeenCalledWith(
      "锁定实验 CVD-2026-0002？锁定后不可修改，只能派生新实验。此操作会写入审计日志。",
    );
    await waitFor(() => {
      const refreshedRow = screen.getByText("CVD-2026-0002").closest("tr");
      expect(refreshedRow).not.toBeNull();
      expect(within(refreshedRow!).getByText("已锁定")).toBeInTheDocument();
    });
  });

  it("clones a locked experiment from the quick action menu and navigates to the cloned draft editor", async () => {
    const requests: Array<{ method: string; pathname: string }> = [];
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        const method = init?.method ?? "GET";
        requests.push({ method, pathname: url.pathname });

        if (method === "POST" && url.pathname === "/api/v1/experiments/locked-exp/clone") {
          return new Response(
            JSON.stringify(
              createExperimentFixture({
                id: "cloned-draft",
                run_code: "CVD-2026-0004",
                status: "draft",
              }),
            ),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          pageSize === 10
            ? [
                createExperimentFixture({
                  id: "locked-exp",
                  run_code: "CVD-2026-0003",
                  status: "locked",
                  submitted_at: "2026-04-23T01:00:00Z",
                  locked_at: "2026-04-23T02:00:00Z",
                }),
              ]
            : [];

        return new Response(
          JSON.stringify(createExperimentListResponse(items, { pageSize })),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(
      <Routes>
        <Route path="/experiments" element={<ExperimentListPage />} />
        <Route path="/experiments/:experimentId/edit" element={<div>克隆草稿编辑页</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
      },
    );

    await screen.findByText("CVD-2026-0003");
    openRowActions("CVD-2026-0003");
    fireEvent.click(screen.getByText("派生"));

    await waitFor(() => {
      expect(requests).toContainEqual({
        method: "POST",
        pathname: "/api/v1/experiments/locked-exp/clone",
      });
    });
    expect(window.confirm).toHaveBeenCalledWith(
      "将派生实验 CVD-2026-0003 的参数为新草稿。确定继续？",
    );
    expect(await screen.findByText("克隆草稿编辑页")).toBeInTheDocument();
  });

  it("only offers JSON export in the invalid experiment quick action menu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          pageSize === 10
            ? [
                createExperimentFixture({
                  id: "invalid-exp",
                  run_code: "CVD-2026-0005",
                  status: "invalid",
                  invalid_reason: "污染",
                }),
              ]
            : [];

        return new Response(
          JSON.stringify(createExperimentListResponse(items, { pageSize })),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    const row = (await screen.findByText("CVD-2026-0005")).closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByRole("button", { name: "查看" })).toBeInTheDocument();

    openRowActions("CVD-2026-0005");

    expect(screen.getByText("导出 JSON")).toBeInTheDocument();
    expect(screen.queryByText("导出 Excel")).not.toBeInTheDocument();
    expect(screen.queryByText("作废")).not.toBeInTheDocument();
    expect(screen.queryByText("锁定")).not.toBeInTheDocument();
    expect(screen.queryByText("派生")).not.toBeInTheDocument();
  });

  it("hides mutating quick actions from viewer users", () => {
    renderWithApp(
      <ExperimentTable
        activeExportKey={null}
        activeTransitionKey={null}
        currentUser={{
          id: "viewer-1",
          email: "viewer@example.com",
          name: "Viewer",
          role: "viewer",
          is_active: true,
          last_login_at: null,
        }}
        items={[
          createExperimentFixture({
            id: "viewer-draft",
            run_code: "CVD-VIEWER-DRAFT",
            owner_id: "viewer-1",
            status: "draft",
          }),
        ]}
        loading={false}
        onClone={vi.fn()}
        onExportExcel={vi.fn()}
        onExportJson={vi.fn()}
        onInvalidate={vi.fn()}
        onLock={vi.fn()}
        onTableChange={vi.fn()}
        page={1}
        pageSize={10}
        sortField={null}
        sortOrder={null}
        total={1}
      />,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
      },
    );

    const row = screen.getByText("CVD-VIEWER-DRAFT").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByRole("button", { name: "查看" })).toBeInTheDocument();
    expect(within(row!).queryByRole("button", { name: "继续填写" })).not.toBeInTheDocument();

    openRowActions("CVD-VIEWER-DRAFT");

    expect(screen.getByText("导出 JSON")).toBeInTheDocument();
    expect(screen.getByText("导出 Excel")).toBeInTheDocument();
    expect(screen.queryByText("作废")).not.toBeInTheDocument();
    expect(screen.queryByText("锁定")).not.toBeInTheDocument();
    expect(screen.queryByText("派生")).not.toBeInTheDocument();
  });

  it("hides owner-only quick actions from members viewing another owner's submitted experiment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          pageSize === 10
            ? [
                createExperimentFixture({
                  id: "other-submitted",
                  run_code: "CVD-OTHER-SUBMITTED",
                  owner_id: "other-user",
                  status: "submitted",
                  submitted_at: "2026-04-23T01:00:00Z",
                }),
              ]
            : [];

        return new Response(
          JSON.stringify(createExperimentListResponse(items, { pageSize })),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    await screen.findByText("CVD-OTHER-SUBMITTED");
    openRowActions("CVD-OTHER-SUBMITTED");

    expect(screen.getByText("导出 JSON")).toBeInTheDocument();
    expect(screen.getByText("导出 Excel")).toBeInTheDocument();
    expect(screen.queryByText("锁定")).not.toBeInTheDocument();
    expect(screen.queryByText("派生")).not.toBeInTheDocument();
  });

  it("requires a user-provided invalidation reason before invalidating from the quick action menu", async () => {
    const requests: Array<{ body: unknown; method: string; pathname: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        const method = init?.method ?? "GET";
        requests.push({
          body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
          method,
          pathname: url.pathname,
        });

        if (method === "POST" && url.pathname === "/api/v1/experiments/draft-exp/invalidate") {
          return new Response(
            JSON.stringify(
              createExperimentFixture({
                id: "draft-exp",
                run_code: "CVD-INVALIDATE-PROMPT",
                status: "invalid",
                invalid_reason: "炉管污染",
              }),
            ),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
              },
            },
          );
        }

        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          pageSize === 10
            ? [
                createExperimentFixture({
                  id: "draft-exp",
                  run_code: "CVD-INVALIDATE-PROMPT",
                  status: "draft",
                }),
              ]
            : [];

        return new Response(
          JSON.stringify(createExperimentListResponse(items, { pageSize })),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    await screen.findByText("CVD-INVALIDATE-PROMPT");
    openRowActions("CVD-INVALIDATE-PROMPT");
    fireEvent.click(screen.getByText("作废"));

    fireEvent.click(screen.getByRole("button", { name: "确认作废" }));
    expect(await screen.findByText("请填写作废原因")).toBeInTheDocument();
    expect(
      requests.some(
        (request) =>
          request.method === "POST" &&
          request.pathname === "/api/v1/experiments/draft-exp/invalidate",
      ),
    ).toBe(false);

    fireEvent.change(screen.getByRole("textbox", { name: "作废原因" }), {
      target: { value: "炉管污染" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认作废" }));

    await waitFor(() => {
      expect(requests).toContainEqual({
        body: { reason: "炉管污染" },
        method: "POST",
        pathname: "/api/v1/experiments/draft-exp/invalidate",
      });
    });
  });

  it("disables row transition controls while a lock request is pending", () => {
    renderWithApp(
      <ExperimentTable
        activeExportKey={null}
        activeTransitionKey="pending-lock:lock"
        currentUser={{
          id: "u-1",
          email: "member@example.com",
          name: "Member",
          role: "member",
          is_active: true,
          last_login_at: null,
        }}
        items={[
          createExperimentFixture({
            id: "pending-lock",
            run_code: "CVD-PENDING-LOCK",
            status: "submitted",
            submitted_at: "2026-04-23T01:00:00Z",
          }),
        ]}
        loading={false}
        onClone={vi.fn()}
        onExportExcel={vi.fn()}
        onExportJson={vi.fn()}
        onInvalidate={vi.fn()}
        onLock={vi.fn()}
        onTableChange={vi.fn()}
        page={1}
        pageSize={10}
        sortField={null}
        sortOrder={null}
        total={1}
      />,
      {
        authenticated: true,
        initialEntries: ["/experiments"],
      },
    );

    const row = screen.getByText("CVD-PENDING-LOCK").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row!).getByRole("button", { name: "查看" })).toBeDisabled();
    expect(
      within(row!).getByRole("button", { name: "更多操作 CVD-PENDING-LOCK" }),
    ).toBeDisabled();
  });

  it("queries dashboard cards with listExperiments-compatible filters", async () => {
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        return new Response(JSON.stringify(createExperimentListResponse()), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    await screen.findByText(/当前共 0 条记录/);

    await waitFor(() => {
      expect(requests).toEqual(
        expect.arrayContaining([
          "/api/v1/experiments?mine=true&status=draft&page=1&page_size=1",
          "/api/v1/experiments?mine=true&status=submitted&page=1&page_size=1",
          "/api/v1/experiments?mine=true&page=1&page_size=3&sort_by=updated_at&sort_order=desc",
        ]),
      );
    });
  });

  it("clicking my drafts applies the mine and draft filters to the list", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        const status = url.searchParams.get("status");
        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          status === "draft" && pageSize === 10
            ? [
                createExperimentFixture({
                  id: "draft-exp",
                  run_code: "CVD-DRAFT-1",
                  status: "draft",
                }),
              ]
            : [];

        return new Response(
          JSON.stringify(
            createExperimentListResponse(items, {
              pageSize,
              total: items.length,
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    await screen.findByText(/当前共 0 条记录/);
    await user.click(screen.getByRole("button", { name: /我的草稿/ }));

    expect(await screen.findByText("CVD-DRAFT-1")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "我的实验" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "草稿" })).toBeChecked();

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request === "/api/v1/experiments?mine=true&status=draft&page=1&page_size=10",
        ),
      ).toBe(true);
    });
  });

  it("clears dashboard-applied filters when navigating back to a blank URL", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        const status = url.searchParams.get("status");
        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          status === "draft" && pageSize === 10
            ? [
                createExperimentFixture({
                  id: "draft-after-card",
                  run_code: "CVD-DASHBOARD-DRAFT",
                  status: "draft",
                }),
              ]
            : pageSize === 10 && !status && url.searchParams.get("mine") !== "true"
              ? [
                  createExperimentFixture({
                    id: "all-after-back",
                    run_code: "CVD-BACK-ALL",
                    status: "submitted",
                  }),
                ]
              : [];

        return new Response(
          JSON.stringify(
            createExperimentListResponse(items, {
              pageSize,
              total: items.length,
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPageWithUrlControls />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    expect(await screen.findByText("CVD-BACK-ALL")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /我的草稿/ }));

    expect(await screen.findByText("CVD-DASHBOARD-DRAFT")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "我的实验" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "草稿" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "返回上一页" }));

    expect(await screen.findByText("CVD-BACK-ALL")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "我的实验" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "草稿" })).not.toBeChecked();

    await waitFor(() => {
      expect(requests.at(-1)).toBe("/api/v1/experiments?page=1&page_size=10");
    });
  });

  it("hydrates mine and draft status filters from the URL", async () => {
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        const isFilteredList =
          url.searchParams.get("mine") === "true" &&
          url.searchParams.get("status") === "draft" &&
          url.searchParams.get("page_size") === "10";
        const items = isFilteredList
          ? [
              createExperimentFixture({
                id: "url-draft",
                run_code: "CVD-URL-DRAFT",
                status: "draft",
              }),
            ]
          : [];

        return new Response(
          JSON.stringify(
            createExperimentListResponse(items, {
              pageSize: Number(url.searchParams.get("page_size") ?? "10"),
              total: items.length,
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments?mine=true&status=draft"],
    });

    expect(await screen.findByText("CVD-URL-DRAFT")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "我的实验" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "草稿" })).toBeChecked();

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request === "/api/v1/experiments?mine=true&status=draft&page=1&page_size=10",
        ),
      ).toBe(true);
    });
  });

  it("clears URL-owned mine and status filters when search params change", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        const status = url.searchParams.get("status");
        const pageSize = Number(url.searchParams.get("page_size") ?? "10");
        const items =
          status === "submitted,locked" && pageSize === 10
            ? [
                createExperimentFixture({
                  id: "submitted-exp",
                  run_code: "CVD-SUBMITTED-1",
                  status: "submitted",
                }),
              ]
            : pageSize === 10 && !status && url.searchParams.get("mine") !== "true"
              ? [
                  createExperimentFixture({
                    id: "all-exp",
                    run_code: "CVD-ALL-1",
                    status: "draft",
                  }),
                ]
              : [];

        return new Response(
          JSON.stringify(
            createExperimentListResponse(items, {
              pageSize,
              total: items.length,
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPageWithUrlControls />, {
      authenticated: true,
      initialEntries: ["/experiments?mine=true&status=submitted,locked"],
    });

    expect(await screen.findByText("CVD-SUBMITTED-1")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "我的实验" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "已提交" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "已锁定" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "清空地址栏筛选" }));

    expect(await screen.findByText("CVD-ALL-1")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "我的实验" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "已提交" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "已锁定" })).not.toBeChecked();

    await waitFor(() => {
      expect(requests.at(-1)).toBe("/api/v1/experiments?page=1&page_size=10");
    });
  });

  it("renders recent edited experiments with status, material, run code, and update time", async () => {
    const recentItems = [
      createExperimentFixture({
        id: "recent-1",
        run_code: "CVD-RECENT-1",
        material_system: "WS2",
        status: "submitted",
        updated_at: "2026-04-24T05:06:00Z",
      }),
      createExperimentFixture({
        id: "recent-2",
        run_code: "CVD-RECENT-2",
        material_system: "MoSe2",
        status: "locked",
        updated_at: "2026-04-23T03:04:00Z",
      }),
    ];
    const expectedUpdatedAt = dayjs(recentItems[0].updated_at).format("YYYY-MM-DD HH:mm");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        const sortBy = url.searchParams.get("sort_by");
        const items = sortBy === "updated_at" ? recentItems : [];
        const pageSize = Number(url.searchParams.get("page_size") ?? "10");

        return new Response(
          JSON.stringify(
            createExperimentListResponse(items, {
              pageSize,
              total: items.length,
            }),
          ),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    const recentCard = await screen.findByTestId("recent-experiments-card");
    await waitFor(() => {
      expect(within(recentCard).getByText("CVD-RECENT-1")).toBeInTheDocument();
    });
    expect(within(recentCard).getByText("WS2")).toBeInTheDocument();
    expect(within(recentCard).getByText("已提交")).toBeInTheDocument();
    expect(within(recentCard).getByText(expectedUpdatedAt)).toBeInTheDocument();
    expect(within(recentCard).getByText("CVD-RECENT-2")).toBeInTheDocument();
    expect(within(recentCard).getByText("MoSe2")).toBeInTheDocument();
    expect(within(recentCard).getByText("已锁定")).toBeInTheDocument();
  });

  it("passes filters and pagination to the backend", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        return new Response(
          JSON.stringify({
            items: [
              {
                id: "exp-1",
                run_code: "CVD-2026-0001",
                owner_id: "u-1",
                derived_from_run_id: null,
                derived_from_run_code: null,
                experiment_type: "cvd",
                material_system: "MoS2",
                experiment_date: "2026-04-23",
                objective: "baseline",
                status: "submitted",
                quality_label: "unknown",
                summary_result: null,
                invalid_reason: null,
                created_at: "2026-04-23T00:00:00Z",
                updated_at: "2026-04-23T00:00:00Z",
                submitted_at: "2026-04-23T00:30:00Z",
                locked_at: null,
              },
            ],
            total: 12,
            page: Number(url.searchParams.get("page") ?? "1"),
            page_size: Number(url.searchParams.get("page_size") ?? "10"),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    expect((await screen.findAllByText("CVD-2026-0001")).length).toBeGreaterThan(0);

    await user.type(screen.getByRole("textbox", { name: "实验搜索" }), "growth");
    await user.type(screen.getByRole("textbox", { name: "材料体系筛选" }), "MoS2");
    await user.click(screen.getByRole("checkbox", { name: "我的实验" }));
    await user.click(screen.getByRole("checkbox", { name: "已提交" }));
    await user.click(screen.getByRole("checkbox", { name: "已锁定" }));
    await waitFor(() => {
      expect(
        requests.some((request) =>
          request.includes(
            "/api/v1/experiments?mine=true&status=submitted%2Clocked&material_system=MoS2&q=growth&page=1&page_size=10",
          ),
        ),
      ).toBe(true);
    });

    expect(screen.queryByRole("button", { name: "应用筛选" })).not.toBeInTheDocument();

    await user.click(screen.getByTitle("2"));

    await waitFor(() => {
      expect(
        requests.some((request) =>
          request.includes(
            "/api/v1/experiments?mine=true&status=submitted%2Clocked&material_system=MoS2&q=growth&page=2&page_size=10",
          ),
        ),
      ).toBe(true);
    });
  });

  it("trims text filters before querying the backend", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        return new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            page_size: 10,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    await screen.findByText(/当前共 0 条记录/);

    await user.type(screen.getByRole("textbox", { name: "实验搜索" }), "  growth  ");
    await user.type(screen.getByRole("textbox", { name: "材料体系筛选" }), "  MoS2  ");

    await waitFor(() => {
      expect(
        requests.some((request) =>
          request.includes("/api/v1/experiments?material_system=MoS2&q=growth&page=1&page_size=10"),
        ),
      ).toBe(true);
    });
  });

  it("passes table sorting to the backend instead of sorting only the current page", async () => {
    const user = userEvent.setup();
    const requests: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        requests.push(`${url.pathname}${url.search}`);

        return new Response(
          JSON.stringify({
            items: [
              {
                id: "exp-1",
                run_code: "CVD-2026-0001",
                owner_id: "u-1",
                derived_from_run_id: null,
                derived_from_run_code: null,
                experiment_type: "cvd",
                material_system: "MoS2",
                experiment_date: "2026-04-23",
                objective: "baseline",
                status: "draft",
                quality_label: "unknown",
                summary_result: null,
                invalid_reason: null,
                created_at: "2026-04-23T00:00:00Z",
                updated_at: "2026-04-23T00:00:00Z",
                submitted_at: null,
                locked_at: null,
              },
            ],
            total: 1,
            page: 1,
            page_size: 10,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }),
    );

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    expect((await screen.findAllByText("CVD-2026-0001")).length).toBeGreaterThan(0);
    await user.click(screen.getByText("实验编号"));

    await waitFor(() => {
      expect(
        requests.some((request) =>
          request.includes("/api/v1/experiments?page=1&page_size=10&sort_by=run_code&sort_order=asc"),
        ),
      ).toBe(true);
    });

    await user.click(screen.getByText("实验编号"));
    await waitFor(() => {
      expect(
        requests.some((request) =>
          request.includes("/api/v1/experiments?page=1&page_size=10&sort_by=run_code&sort_order=desc"),
        ),
      ).toBe(true);
    });

    await user.click(screen.getByText("实验编号"));
    await waitFor(() => {
      expect(requests.at(-1)).toContain("/api/v1/experiments?page=1&page_size=10");
      expect(requests.at(-1)).not.toContain("sort_by=");
    });
  });

  it("does not nest links inside the primary create button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            page_size: 10,
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

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
    });

    const createButtons = await screen.findAllByRole("button", { name: "新建实验" });
    expect(createButtons.length).toBeGreaterThan(0);
    for (const createButton of createButtons) {
      expect(createButton.querySelector("a")).toBeNull();
    }
  });

  it("hides the create entry for viewer users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [],
            total: 0,
            page: 1,
            page_size: 10,
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

    renderWithApp(<ExperimentListPage />, {
      authenticated: true,
      initialEntries: ["/experiments"],
      user: {
        id: "viewer-1",
        email: "viewer@example.com",
        name: "Viewer",
        role: "viewer",
        is_active: true,
        last_login_at: null,
      },
    });

    await screen.findByText(/实验记录/);
    expect(screen.queryByRole("button", { name: "新建实验" })).not.toBeInTheDocument();
  });
});
