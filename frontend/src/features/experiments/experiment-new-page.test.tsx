import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ExperimentNewPage } from "./experiment-new-page";
import { renderWithApp } from "../../test/render";

describe("ExperimentNewPage", () => {
  afterEach(() => {
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
});
