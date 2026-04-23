import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ExperimentDetailPage } from "./experiment-detail-page";
import { ExperimentEditorPage } from "./experiment-editor-page";
import { renderWithApp } from "../../test/render";

describe("Experiment detail-like pages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an error state when the detail request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Experiment not found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-missing"],
      },
    );

    expect(await screen.findByText("Experiment not found")).toBeInTheDocument();
  });

  it("shows an error state when the editor request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Experiment not found" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-missing/edit"],
      },
    );

    expect(await screen.findByText("Experiment not found")).toBeInTheDocument();
  });
});
