import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
    summary_result: "Baseline film observed",
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
      "environment",
      createModulePayload(experiment.id, "environment", {
        indoor_temperature_C: 25,
        indoor_humidity_percent: 45,
        sample_env: "clean",
        abnormal_note: "",
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
        items: [{ role: "A", type: "MoO3", mass_mg: 15 }],
      }),
    ],
    [
      "substrates",
      createModulePayload(experiment.id, "substrates", {
        items: [
          {
            role: "top",
            type: "SiO2/Si",
            brand: "Brand A",
            position_mm: 1,
            surface_finish: "polished",
          },
        ],
      }),
    ],
    [
      "process_observation",
      createModulePayload(experiment.id, "process_observation", {
        color_change: "center area darkened",
        abnormal_events: ["minor condensate"],
        note: "growth stable after 15 min",
        observer: "tech-1",
      }),
    ],
    [
      "characterization",
      createModulePayload(experiment.id, "characterization", {
        methods: [
          {
            method: "Raman",
            result: "peak visible",
            enabled: true,
            excitation_nm: 532,
            note: "baseline run",
          },
        ],
      }),
    ],
    [
      "result_summary",
      createModulePayload(experiment.id, "result_summary", {
        summary_result: "Baseline film observed",
        quality_label: "success",
        next_step: "Repeat growth",
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
              { time_min: 0, temperature_C: 25, ramp_rate_C_per_min: 10 },
              { time_min: 30, temperature_C: 750, ramp_rate_C_per_min: 20 },
            ],
            position_mm: 10,
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
            components: [{ gas: "H2", ratio_percent: 5 }],
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
    expect(screen.getByRole("heading", { name: "环境条件" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "预检查" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "前驱体" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "基底" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "炉温程序" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "气体程序" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "过程观察" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "表征结果" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "结果总结" })).toBeInTheDocument();
    expect(screen.getByLabelText("实验目的")).toHaveValue("Baseline growth");
    expect(screen.getByLabelText("样品环境")).toHaveValue("clean");
    expect(screen.getByLabelText("前驱体类型 1")).toHaveValue("MoO3");
    expect(screen.getByLabelText("颜色变化")).toHaveValue("center area darkened");
    expect(screen.getByLabelText("表征方法 1")).toHaveValue("Raman");
    expect(screen.getByLabelText("总结结论")).toHaveValue("Baseline film observed");
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
              payload_json?: { items?: Array<{ mass_mg?: number; type?: string }> };
            }
          ).payload_json?.items?.[0]?.type === "WO3" &&
          (
            request.body as {
              payload_json?: { items?: Array<{ mass_mg?: number }> };
            }
          ).payload_json?.items?.[0]?.mass_mg === 15,
      ),
    ).toBe(true);

    const substrateBrandInput = screen.getByLabelText("品牌 1");
    vi.useFakeTimers();
    fireEvent.change(substrateBrandInput, { target: { value: "Brand B" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some((request) => {
          if (
            request.method !== "PUT" ||
            request.pathname !== "/api/v1/experiments/exp-1/modules/substrates"
          ) {
            return false;
          }

          const items = (
            request.body as {
              payload_json?: {
                items?: Array<{ brand?: string; surface_finish?: string }>;
              };
            }
          ).payload_json?.items;

          return Array.isArray(items) && items[0]?.brand === "Brand B" && items[0]?.surface_finish === "polished";
        }),
      ).toBe(true);
    });

    const furnaceTemperatureInput = screen.getByLabelText("温度 1-2");
    vi.useFakeTimers();
    fireEvent.change(furnaceTemperatureInput, { target: { value: "760" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some((request) => {
          if (
            request.method !== "PUT" ||
            request.pathname !== "/api/v1/experiments/exp-1/modules/furnace_program"
          ) {
            return false;
          }

          const zones = (
            request.body as {
              payload_json?: {
                zones?: Array<{
                  position_mm?: number;
                  temperature_program?: Array<{ ramp_rate_C_per_min?: number; temperature_C?: number }>;
                }>;
              };
            }
          ).payload_json?.zones;

          return (
            Array.isArray(zones) &&
            zones[0]?.position_mm === 10 &&
            Array.isArray(zones[0]?.temperature_program) &&
            zones[0]?.temperature_program?.[1]?.temperature_C === 760 &&
            zones[0]?.temperature_program?.[1]?.ramp_rate_C_per_min === 20
          );
        }),
      ).toBe(true);
    });

    const gasFlowInput = screen.getByLabelText("流量 1");
    vi.useFakeTimers();
    fireEvent.change(gasFlowInput, { target: { value: "90" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some((request) => {
          if (
            request.method !== "PUT" ||
            request.pathname !== "/api/v1/experiments/exp-1/modules/gas_program"
          ) {
            return false;
          }

          const segments = (
            request.body as {
              payload_json?: {
                segments?: Array<{
                  components?: Array<{ gas?: string; ratio_percent?: number }>;
                  flow_sccm?: number;
                }>;
              };
            }
          ).payload_json?.segments;

          return (
            Array.isArray(segments) &&
            segments[0]?.flow_sccm === 90 &&
            Array.isArray(segments[0]?.components) &&
            segments[0]?.components?.[0]?.gas === "H2" &&
            segments[0]?.components?.[0]?.ratio_percent === 5
          );
        }),
      ).toBe(true);
    });

    const sampleEnvInput = screen.getByLabelText("样品环境");
    vi.useFakeTimers();
    fireEvent.change(sampleEnvInput, { target: { value: "tube-side shelf" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "PUT" &&
            request.pathname === "/api/v1/experiments/exp-1/modules/environment" &&
            (
              request.body as {
                payload_json?: {
                  indoor_humidity_percent?: number;
                  sample_env?: string;
                };
              }
            ).payload_json?.sample_env === "tube-side shelf" &&
            (
              request.body as {
                payload_json?: {
                  indoor_humidity_percent?: number;
                };
              }
            ).payload_json?.indoor_humidity_percent === 45,
        ),
      ).toBe(true);
    });

    const colorChangeInput = screen.getByLabelText("颜色变化");
    vi.useFakeTimers();
    fireEvent.change(colorChangeInput, { target: { value: "edge darkened" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "PUT" &&
            request.pathname === "/api/v1/experiments/exp-1/modules/process_observation" &&
            (
              request.body as {
                payload_json?: {
                  color_change?: string;
                  observer?: string;
                };
              }
            ).payload_json?.color_change === "edge darkened" &&
            (
              request.body as {
                payload_json?: {
                  observer?: string;
                };
              }
            ).payload_json?.observer === "tech-1",
        ),
      ).toBe(true);
    });

    const characterizationResultInput = screen.getByLabelText("表征结果 1");
    vi.useFakeTimers();
    fireEvent.change(characterizationResultInput, {
      target: { value: "peak intensity improved" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some((request) => {
          if (
            request.method !== "PUT" ||
            request.pathname !== "/api/v1/experiments/exp-1/modules/characterization"
          ) {
            return false;
          }

          const methods = (
            request.body as {
              payload_json?: {
                methods?: Array<{
                  result?: string;
                  enabled?: boolean;
                  excitation_nm?: number;
                  note?: string;
                }>;
              };
            }
          ).payload_json?.methods;

          return (
            Array.isArray(methods) &&
            methods[0]?.result === "peak intensity improved" &&
            methods[0]?.enabled === true &&
            methods[0]?.excitation_nm === 532 &&
            methods[0]?.note === "baseline run"
          );
        }),
      ).toBe(true);
    });

    const summaryInput = screen.getByLabelText("总结结论");
    vi.useFakeTimers();
    fireEvent.change(summaryInput, { target: { value: "Continuous film formed" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "PATCH" &&
            request.pathname === "/api/v1/experiments/exp-1" &&
            (request.body as { summary_result?: string }).summary_result === "Continuous film formed",
        ),
      ).toBe(true);
      expect(
        server.requests.some(
          (request) =>
            request.method === "PUT" &&
            request.pathname === "/api/v1/experiments/exp-1/modules/result_summary" &&
            (
              request.body as {
                payload_json?: {
                  next_step?: string;
                  quality_label?: string;
                  summary_result?: string;
                };
              }
            ).payload_json?.summary_result === "Continuous film formed" &&
            (
              request.body as {
                payload_json?: {
                  quality_label?: string;
                  next_step?: string;
                };
              }
            ).payload_json?.quality_label === "success" &&
            (
              request.body as {
                payload_json?: {
                  next_step?: string;
                };
              }
            ).payload_json?.next_step === "Repeat growth",
        ),
      ).toBe(true);
    });
  });

  it("keeps later in-progress edits when a basic info autosave finishes", async () => {
    const server = createEditorFetchMock();
    let releasePatchRequest!: () => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/experiments/exp-1" && method === "PATCH") {
        return new Promise<Response>((resolve) => {
          releasePatchRequest = () => {
            void server.fetchMock(input, init).then(resolve);
          };
        });
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

    const objectiveInput = await screen.findByLabelText("实验目的");
    vi.useFakeTimers();
    fireEvent.change(objectiveInput, { target: { value: "Updated objective" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    const sampleEnvInput = screen.getByLabelText("样品环境");
    fireEvent.change(sampleEnvInput, { target: { value: "pending unsaved env" } });

    releasePatchRequest();
    vi.useRealTimers();

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "PUT" &&
            request.pathname === "/api/v1/experiments/exp-1/modules/basic_info",
        ),
      ).toBe(true);
    });

    expect(screen.getByLabelText("样品环境")).toHaveValue("pending unsaved env");
  });

  it("keeps characterization metadata attached to surviving rows after deleting a previous row", async () => {
    const server = createEditorFetchMock();
    server.modules.set(
      "characterization",
      createModulePayload(server.experiment.id, "characterization", {
        methods: [
          {
            method: "Raman",
            result: "first result",
            enabled: true,
            excitation_nm: 488,
            note: "first run",
          },
          {
            method: "PL",
            result: "second result",
            enabled: false,
            excitation_nm: 633,
            note: "second run",
          },
        ],
      }),
    );
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

    const firstCard = (await screen.findByText("表征记录 1")).closest(".editor-array-card");
    expect(firstCard).not.toBeNull();
    fireEvent.click(within(firstCard as HTMLElement).getByRole("button", { name: "删除" }));

    const remainingMethodInput = await screen.findByLabelText("表征方法 1");
    expect(remainingMethodInput).toHaveValue("PL");

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("表征结果 1"), {
      target: { value: "second result updated" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(
        server.requests.some((request) => {
          if (
            request.method !== "PUT" ||
            request.pathname !== "/api/v1/experiments/exp-1/modules/characterization"
          ) {
            return false;
          }

          const methods = (
            request.body as {
              payload_json?: {
                methods?: Array<{
                  enabled?: boolean;
                  excitation_nm?: number;
                  method?: string;
                  note?: string;
                  result?: string;
                }>;
              };
            }
          ).payload_json?.methods;

          return (
            Array.isArray(methods) &&
            methods.length === 1 &&
            methods[0]?.method === "PL" &&
            methods[0]?.result === "second result updated" &&
            methods[0]?.enabled === false &&
            methods[0]?.excitation_nm === 633 &&
            methods[0]?.note === "second run"
          );
        }),
      ).toBe(true);
    });
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

  it("keeps patched basic info visible when the module write fails after PATCH", async () => {
    const server = createEditorFetchMock();
    let failNextBasicInfoModuleSave = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (
        url.pathname === "/api/v1/experiments/exp-1/modules/basic_info" &&
        method === "PUT" &&
        failNextBasicInfoModuleSave
      ) {
        failNextBasicInfoModuleSave = false;
        return jsonResponse({ detail: "Basic info module save failed" }, { status: 422 });
      }

      return server.fetchMock(input, init);
    });

    vi.stubGlobal("fetch", fetchMock);
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

    const objectiveInput = await screen.findByLabelText("实验目的");
    vi.useFakeTimers();
    fireEvent.change(objectiveInput, { target: { value: "Updated objective" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    expect(await screen.findByText("Basic info module save failed")).toBeInTheDocument();

    firstRender.unmount();

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

    expect(await screen.findByLabelText("实验目的")).toHaveValue("Updated objective");
  });

  it("keeps patched result summary visible when the module write fails after PATCH", async () => {
    const server = createEditorFetchMock();
    let failNextResultSummarySave = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (
        url.pathname === "/api/v1/experiments/exp-1/modules/result_summary" &&
        method === "PUT" &&
        failNextResultSummarySave
      ) {
        failNextResultSummarySave = false;
        return jsonResponse({ detail: "Result summary module save failed" }, { status: 422 });
      }

      return server.fetchMock(input, init);
    });

    vi.stubGlobal("fetch", fetchMock);
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

    const summaryInput = await screen.findByLabelText("总结结论");
    vi.useFakeTimers();
    fireEvent.change(summaryInput, { target: { value: "Continuous film formed" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    expect(await screen.findByText("Result summary module save failed")).toBeInTheDocument();

    firstRender.unmount();

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

    expect(await screen.findByLabelText("总结结论")).toHaveValue("Continuous film formed");
  });

  it("does not overwrite the experiment cache after a module-only autosave", async () => {
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

    const objectiveInput = await screen.findByLabelText("实验目的");
    vi.useFakeTimers();
    fireEvent.change(objectiveInput, { target: { value: "Updated objective" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      const cachedExperiment = queryClient.getQueryData<ExperimentFixture>([
        "experiments",
        "editor",
        "u-1",
        "exp-1",
      ]);
      expect(cachedExperiment?.objective).toBe("Updated objective");
    });

    vi.useFakeTimers();
    fireEvent.change(screen.getByLabelText("样品环境"), {
      target: { value: "tube-side shelf" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    await waitFor(() => {
      const cachedExperiment = queryClient.getQueryData<ExperimentFixture>([
        "experiments",
        "editor",
        "u-1",
        "exp-1",
      ]);
      expect(cachedExperiment?.objective).toBe("Updated objective");
    });
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

  it("renders non-draft experiments in read-only mode", async () => {
    const server = createEditorFetchMock();
    server.experiment.status = "locked";
    server.experiment.locked_at = "2026-04-23T02:30:00Z";
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

    expect(await screen.findByText("当前实验已离开 draft 状态，编辑器保持只读。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "提交实验" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("总结结论")).toBeDisabled();
    expect(screen.getByLabelText("异常备注")).toBeDisabled();
  });
});
