import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
