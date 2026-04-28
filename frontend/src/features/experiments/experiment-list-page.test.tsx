import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useNavigate } from "react-router-dom";

import { ExperimentListPage } from "./experiment-list-page";
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
