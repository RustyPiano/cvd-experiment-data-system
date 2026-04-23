import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ExperimentEditorPage } from "./experiment-editor-page";
import { renderWithApp } from "../../test/render";

type ExperimentFixture = {
  id: string;
  run_code: string;
  owner_id: string;
  derived_from_run_id: string | null;
  experiment_type: string;
  material_system: string | null;
  experiment_date: string;
  objective: string | null;
  status: "draft" | "submitted" | "locked" | "invalid";
  quality_label: "success" | "partial" | "failed" | "unknown";
  summary_result: string | null;
  invalid_reason: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  locked_at: string | null;
};

type ModulePayload = {
  id: string;
  experiment_run_id: string;
  module_key: string;
  schema_version: string;
  payload_json: Record<string, unknown>;
  note: string | null;
  created_at: string;
  updated_at: string;
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function createModulePayload(
  experimentId: string,
  moduleKey: string,
  payloadJson: Record<string, unknown>,
): ModulePayload {
  return {
    id: `module-${moduleKey}`,
    experiment_run_id: experimentId,
    module_key: moduleKey,
    schema_version: "cvd_v1",
    payload_json: payloadJson,
    note: null,
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
  };
}

function createEditorFetchMock() {
  const experiment: ExperimentFixture = {
    id: "exp-1",
    run_code: "CVD-2026-0001",
    owner_id: "u-1",
    derived_from_run_id: null,
    experiment_type: "cvd_2zone",
    material_system: "MoS2",
    experiment_date: "2026-04-23",
    objective: "Baseline growth",
    status: "draft",
    quality_label: "unknown",
    summary_result: null,
    invalid_reason: null,
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
    submitted_at: null,
    locked_at: null,
  };

  const modules = new Map<string, ModulePayload>([
    [
      "basic_info",
      createModulePayload(experiment.id, "basic_info", {
        operator_id: "u-1",
        experiment_type: "cvd_2zone",
        material_system: "MoS2",
        experiment_date: "2026-04-23",
        objective: "Baseline growth",
      }),
    ],
    [
      "precheck",
      createModulePayload(experiment.id, "precheck", {
        seal_intact: true,
        risk_note: "",
      }),
    ],
    [
      "precursors",
      createModulePayload(experiment.id, "precursors", {
        items: [{ role: "A", type: "MoO3" }],
      }),
    ],
    [
      "substrates",
      createModulePayload(experiment.id, "substrates", {
        items: [{ role: "top", type: "SiO2/Si", brand: "Brand A", position_mm: 1 }],
      }),
    ],
    [
      "furnace_program",
      createModulePayload(experiment.id, "furnace_program", {
        zones: [
          {
            zone_index: 1,
            precursor_placed: true,
            note: "",
            temperature_program: [
              { time_min: 0, temperature_C: 25 },
              { time_min: 30, temperature_C: 750 },
            ],
          },
        ],
      }),
    ],
    [
      "gas_program",
      createModulePayload(experiment.id, "gas_program", {
        pre_washing_gas: "Ar+H2",
        segments: [
          {
            stage: "growth",
            gas: "Ar",
            start_min: 0,
            end_min: 45,
            flow_sccm: 80,
            components: [],
          },
        ],
      }),
    ],
  ]);

  const requests: Array<{
    method: string;
    pathname: string;
    body: unknown;
  }> = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const method = init?.method ?? "GET";
    const body =
      typeof init?.body === "string" && init.body.length > 0 ? JSON.parse(init.body) : null;

    requests.push({
      method,
      pathname: url.pathname,
      body,
    });

    if (url.pathname === "/api/v1/experiments/exp-1" && method === "GET") {
      return jsonResponse(experiment);
    }

    if (url.pathname === "/api/v1/experiments/exp-1/modules" && method === "GET") {
      return jsonResponse({
        items: [...modules.values()],
        total: modules.size,
      });
    }

    if (url.pathname === "/api/v1/experiments/exp-1" && method === "PATCH") {
      Object.assign(experiment, body);
      experiment.updated_at = "2026-04-23T01:00:00Z";
      return jsonResponse(experiment);
    }

    if (url.pathname.startsWith("/api/v1/experiments/exp-1/modules/") && method === "PUT") {
      const moduleKey = url.pathname.split("/").pop() ?? "";
      const nextPayload = createModulePayload(
        experiment.id,
        moduleKey,
        ((body as { payload_json?: Record<string, unknown> } | null)?.payload_json ?? {}) as Record<
          string,
          unknown
        >,
      );
      modules.set(moduleKey, nextPayload);
      return jsonResponse(nextPayload);
    }

    if (url.pathname === "/api/v1/experiments/exp-1/submit" && method === "POST") {
      experiment.status = "submitted";
      experiment.submitted_at = "2026-04-23T02:00:00Z";
      return jsonResponse(experiment);
    }

    return new Response("Not found", { status: 404 });
  });

  return {
    experiment,
    modules,
    requests,
    fetchMock,
  };
}

describe("ExperimentEditorPage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("renders the core editor sections for a draft experiment", async () => {
    const server = createEditorFetchMock();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/edit"],
      },
    );

    expect(await screen.findByRole("heading", { name: "基础信息" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "预检查" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "前驱体" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "基底" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "炉温程序" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "气体程序" })).toBeInTheDocument();
    expect(screen.getByLabelText("实验目的")).toHaveValue("Baseline growth");
    expect(screen.getByLabelText("前驱体类型 1")).toHaveValue("MoO3");
    expect(screen.getByRole("button", { name: "提交实验" })).toBeInTheDocument();
  });

  it("autosaves edited draft fields", async () => {
    const server = createEditorFetchMock();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/edit"],
      },
    );

    const objectiveInput = await screen.findByLabelText("实验目的");
    vi.useFakeTimers();
    fireEvent.change(objectiveInput, { target: { value: "Updated objective" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    expect(
      server.requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.pathname === "/api/v1/experiments/exp-1" &&
          (request.body as { objective?: string }).objective === "Updated objective",
      ),
    ).toBe(true);
    expect(
      server.requests.some(
        (request) =>
          request.method === "PATCH" &&
          request.pathname === "/api/v1/experiments/exp-1" &&
          !("experiment_type" in ((request.body as Record<string, unknown>) ?? {})) &&
          !("experiment_date" in ((request.body as Record<string, unknown>) ?? {})),
      ),
    ).toBe(true);

    const precursorTypeInput = screen.getByLabelText("前驱体类型 1");
    fireEvent.change(precursorTypeInput, { target: { value: "WO3" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    expect(
      server.requests.some(
        (request) =>
          request.method === "PUT" &&
          request.pathname === "/api/v1/experiments/exp-1/modules/precursors" &&
          Array.isArray(
            (request.body as { payload_json?: { items?: Array<{ type?: string }> } }).payload_json
              ?.items,
          ) &&
          (
            request.body as {
              payload_json?: { items?: Array<{ type?: string }> };
            }
          ).payload_json?.items?.[0]?.type === "WO3",
      ),
    ).toBe(true);
  });

  it("keeps autosaved module edits when reopening the editor with a fresh query cache", async () => {
    const server = createEditorFetchMock();
    vi.stubGlobal("fetch", server.fetchMock);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 30_000,
        },
      },
    });

    const firstRender = renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/edit"],
        queryClient,
      },
    );

    const precursorTypeInput = await screen.findByLabelText("前驱体类型 1");
    vi.useFakeTimers();
    fireEvent.change(precursorTypeInput, { target: { value: "WO3" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    firstRender.unmount();
    vi.useRealTimers();

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/edit"],
        queryClient,
      },
    );

    expect(await screen.findByLabelText("前驱体类型 1")).toHaveValue("WO3");
  });

  it("submits the experiment after loading the draft editor", async () => {
    const server = createEditorFetchMock();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/edit"],
      },
    );

    const submitButton = (await screen.findAllByRole("button", { name: "提交实验" }))[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/experiments/exp-1/submit",
        ),
      ).toBe(true);
    });

    expect(await screen.findByText("已提交")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交实验" })).not.toBeInTheDocument();
  });

  it("submits immediately after a failed autosave is fixed", async () => {
    const server = createEditorFetchMock();
    let failNextPrecursorSave = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (
        url.pathname === "/api/v1/experiments/exp-1/modules/precursors" &&
        method === "PUT" &&
        failNextPrecursorSave
      ) {
        failNextPrecursorSave = false;
        return jsonResponse({ detail: "Precursor save failed" }, { status: 422 });
      }

      return server.fetchMock(input, init);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/edit"],
      },
    );

    const precursorTypeInput = await screen.findByLabelText("前驱体类型 1");
    vi.useFakeTimers();
    fireEvent.change(precursorTypeInput, { target: { value: "WO3" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    expect(await screen.findByText("Precursor save failed")).toBeInTheDocument();

    vi.useFakeTimers();
    fireEvent.change(precursorTypeInput, { target: { value: "WO3-fixed" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    const submitButton = (await screen.findAllByRole("button", { name: "提交实验" }))[0];
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/experiments/exp-1/submit",
        ),
      ).toBe(true);
    });
  });
});
