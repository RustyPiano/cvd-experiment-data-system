import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExperimentListPage } from "./experiment-list-page";
import { renderWithApp } from "../../test/render";

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

    expect(await screen.findByText("CVD-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("MoS2")).toBeInTheDocument();
    expect(screen.getByText(/当前共/i)).toBeInTheDocument();
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

    expect(await screen.findByText("CVD-2026-0001")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "实验搜索" }), "growth");
    await user.type(screen.getByRole("textbox", { name: "材料体系筛选" }), "MoS2");
    await user.click(screen.getByRole("checkbox", { name: "我的实验" }));
    await user.click(screen.getByRole("checkbox", { name: "已提交" }));
    await user.click(screen.getByRole("checkbox", { name: "已锁定" }));
    await waitFor(() => {
      expect(
        requests.some((request) =>
          request.includes(
            "/api/v1/experiments?mine=true&status=submitted%2Clocked&material_system=MoS2&q=growth&page=1&page_size=10&sort_by=updated_at&sort_order=desc",
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
            "/api/v1/experiments?mine=true&status=submitted%2Clocked&material_system=MoS2&q=growth&page=2&page_size=10&sort_by=updated_at&sort_order=desc",
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
          request.includes("/api/v1/experiments?material_system=MoS2&q=growth&page=1&page_size=10&sort_by=updated_at&sort_order=desc"),
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

    expect(await screen.findByText("CVD-2026-0001")).toBeInTheDocument();
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
      expect(requests.at(-1)).toContain(
        "/api/v1/experiments?page=1&page_size=10&sort_by=updated_at&sort_order=desc",
      );
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
