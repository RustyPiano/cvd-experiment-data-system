import { cleanup, screen } from "@testing-library/react";
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
  });

  it("does not nest links inside the primary create button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            items: [],
            total: 0,
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
