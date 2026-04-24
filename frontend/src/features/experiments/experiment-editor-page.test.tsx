import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, Route, RouterProvider, Routes } from "react-router-dom";

import { AuthProvider, createSessionSnapshot } from "../auth/auth-store";
import { ExperimentEditorPage } from "./experiment-editor-page";
import { renderWithApp } from "../../test/render";

type ExperimentFixture = {
  id: string;
  run_code: string;
  owner_id: string;
  derived_from_run_id: string | null;
  derived_from_run_code: string | null;
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
    derived_from_run_code: null,
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
        hood_clean: true,
        flange_blocked: false,
        boat_contamination_level: "low",
        tube_contamination_level: "medium",
      }),
    ],
    [
      "precursors",
      createModulePayload(experiment.id, "precursors", {
        items: [
          {
            role: "A",
            type: "MoO3",
            brand: "Alfa",
            concentration: 0.5,
            concentration_unit: "mol/L",
            method: "spin_coating",
            melting_temperature_C: 180,
            spin_speed_rpm: 2800,
            pre_spin_speed_rpm: 500,
            preparation_time_min: 12,
            mass_mg: 15,
            batch_no: "MO-2026-01",
          },
        ],
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
            treatment_method: "anneal",
            treatment_params: {
              temperature_C: 300,
              duration_min: 20,
              power_W: null,
              gas: "Ar",
            },
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
            note: "keep carrier stable",
            components: [{ name: "H2", fraction: 0.05 }],
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

    if (url.pathname === "/api/v1/experiments/exp-1/validate" && method === "POST") {
      return jsonResponse({
        ok: true,
        errors: [],
        warnings: [],
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

function renderEditorWithDataRouter(queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const router = createMemoryRouter(
    [
      {
        path: "/experiments/:experimentId/edit",
        element: <ExperimentEditorPage />,
      },
      {
        path: "/experiments/:experimentId",
        element: <div>Experiment detail route</div>,
      },
    ],
    { initialEntries: ["/experiments/exp-1/edit"] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        value={{
          session: createSessionSnapshot("token-123", {
            id: "u-1",
            email: "member@example.com",
            name: "Test Member",
            role: "member",
            is_active: true,
            last_login_at: null,
          }),
        }}
      >
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { queryClient, router };
}

describe("ExperimentEditorPage", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
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
    expect(screen.getByRole("button", { name: "返回详情" })).toBeInTheDocument();
    expect(screen.getByLabelText("实验目的")).toHaveValue("Baseline growth");
    expect(screen.getByLabelText("样品环境")).toHaveValue("clean");
    expect(screen.getByLabelText("室内湿度 (%)")).toHaveValue("45");
    expect(screen.getByRole("radiogroup", { name: "通风橱已清洁" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio", { name: "未检查" }).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText("前驱体类型 1")).toHaveValue("MoO3");
    expect(screen.getByLabelText("前驱体品牌 1")).toHaveValue("Alfa");
    expect(screen.getByLabelText("前驱体批次 1")).toHaveValue("MO-2026-01");
    expect(screen.getByLabelText("处理参数温度 1")).toHaveValue("300");
    expect(screen.getByLabelText("程序段备注 1")).toHaveValue("keep carrier stable");
    expect(screen.getByLabelText("组件气体 1-1")).toHaveValue("H2");
    expect(screen.getByLabelText("颜色变化")).toHaveValue("center area darkened");
    expect(screen.getByLabelText("表征方法 1")).toHaveValue("Raman");
    expect(screen.getByRole("switch", { name: "启用表征 1" })).toBeChecked();
    expect(screen.getByLabelText("激发波长 1")).toHaveValue("532");
    expect(screen.getByLabelText("总结结论")).toHaveValue("Baseline film observed");
    expect(screen.getByRole("radiogroup", { name: "质量评级" })).toBeInTheDocument();
    expect(screen.getByLabelText("下一步建议")).toHaveValue("Repeat growth");
    expect(screen.getByRole("button", { name: "提交实验" })).toBeInTheDocument();
  });

  it("shows source banner for a cloned draft", async () => {
    const server = createEditorFetchMock();
    server.experiment.derived_from_run_id = "exp-source";
    server.experiment.derived_from_run_code = "CVD-2026-0001";
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

    expect(await screen.findByText("本实验派生自 CVD-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CVD-2026-0001" })).toHaveAttribute(
      "href",
      "/experiments/exp-source",
    );
  });

  it("autosaves contamination level as null when cleared to unchecked", async () => {
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

    const boatContaminationGroup = await screen.findByRole("radiogroup", {
      name: "瓷舟污染等级",
    });
    vi.useFakeTimers();
    fireEvent.click(within(boatContaminationGroup).getByRole("radio", { name: "未检查" }));

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
            request.pathname !== "/api/v1/experiments/exp-1/modules/precheck"
          ) {
            return false;
          }

          const payload = (
            request.body as {
              payload_json?: {
                boat_contamination_level?: string | null;
                tube_contamination_level?: string | null;
              };
            }
          ).payload_json;

          return (
            payload?.boat_contamination_level === null &&
            payload?.tube_contamination_level === "medium"
          );
        }),
      ).toBe(true);
    });
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

    const experimentTypeInput = await screen.findByLabelText("实验类型");
    const objectiveInput = await screen.findByLabelText("实验目的");
    vi.useFakeTimers();
    fireEvent.change(experimentTypeInput, { target: { value: "cvd_hot_wall" } });
    fireEvent.change(objectiveInput, { target: { value: "Updated objective" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    expect(
      server.requests.some(
        (request) =>
          request.method === "PUT" &&
          request.pathname === "/api/v1/experiments/exp-1/modules/basic_info" &&
          (
            request.body as {
              payload_json?: {
                experiment_type?: string;
              };
            }
          ).payload_json?.experiment_type === "cvd_hot_wall",
      ),
    ).toBe(true);
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
          (request.body as { experiment_type?: string }).experiment_type === "cvd_hot_wall" &&
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
                  components?: Array<{ name?: string; fraction?: number }>;
                  flow_sccm?: number;
                }>;
              };
            }
          ).payload_json?.segments;

          return (
            Array.isArray(segments) &&
            segments[0]?.flow_sccm === 90 &&
            Array.isArray(segments[0]?.components) &&
            segments[0]?.components?.[0]?.name === "H2" &&
            segments[0]?.components?.[0]?.fraction === 0.05
          );
        }),
      ).toBe(true);
    });

    const humidityInput = screen.getByLabelText("室内湿度 (%)");
    vi.useFakeTimers();
    fireEvent.change(humidityInput, { target: { value: "55" } });

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
                };
              }
            ).payload_json?.indoor_humidity_percent === 55,
        ),
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
            ).payload_json?.indoor_humidity_percent === 55,
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
    fireEvent.click(screen.getByRole("radio", { name: "部分成功" }));
    fireEvent.change(screen.getByLabelText("下一步建议"), {
      target: { value: "Inspect AFM before the next run" },
    });
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
            ).payload_json?.quality_label === "partial" &&
            (
              request.body as {
                payload_json?: {
                  next_step?: string;
                };
              }
            ).payload_json?.next_step === "Inspect AFM before the next run",
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
    queryClient.setQueryData(["experiments", "list", "u-1"], {
      items: [{ ...server.experiment, quality_label: "unknown" }],
      page: 1,
      page_size: 20,
      total: 1,
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

  it("updates the local experiment cache when quality label autosaves", async () => {
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
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

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

    await screen.findByLabelText("总结结论");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("radio", { name: "部分成功" }));

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
      expect(cachedExperiment?.quality_label).toBe("partial");
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["experiments", "list", "u-1"],
      });
    });
  });

  it("keeps section inputs disabled while submit validation is running", async () => {
    const server = createEditorFetchMock();
    let resolveValidate!: () => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/experiments/exp-1/validate" && method === "POST") {
        return new Promise<Response>((resolve) => {
          resolveValidate = () => {
            resolve(
              jsonResponse({
                ok: true,
                errors: [],
                warnings: [],
              }),
            );
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

    fireEvent.click(await screen.findByRole("button", { name: "提交实验" }));

    await waitFor(() => {
      expect(screen.getByLabelText("实验目的")).toBeDisabled();
      expect(screen.getByLabelText("前驱体类型 1")).toBeDisabled();
    });

    resolveValidate();

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

  it("shows validation summary and blocks submit when validate returns errors", async () => {
    const server = createEditorFetchMock();
    const scrollIntoViewMock = vi.fn();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/experiments/exp-1/validate" && method === "POST") {
        return jsonResponse({
          ok: false,
          errors: [
            {
              module_key: "precursors",
              field_path: "items",
              message: "At least one precursor is required",
            },
          ],
          warnings: [
            {
              module_key: "result_summary",
              field_path: "quality_label",
              message: "Quality label is unknown",
            },
          ],
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

    fireEvent.click(await screen.findByRole("button", { name: "提交实验" }));

    expect(await screen.findByText("校验发现 1 个错误，1 个警告")).toBeInTheDocument();
    expect(screen.getByText("At least one precursor is required")).toBeInTheDocument();
    expect(screen.getByText("Quality label is unknown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /At least one precursor is required/i }));
    expect(scrollIntoViewMock).toHaveBeenCalled();
    expect(
      server.requests.some(
        (request) =>
          request.method === "POST" &&
          request.pathname === "/api/v1/experiments/exp-1/submit",
      ),
    ).toBe(false);
  });

  it("warns before leaving when there are unsaved changes after a save failure", async () => {
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

    const beforeUnloadEvent = new Event("beforeunload", { cancelable: true });
    fireEvent(window, beforeUnloadEvent);

    expect(beforeUnloadEvent.defaultPrevented).toBe(true);
  });

  it("blocks data router navigation when unsaved changes remain after a save failure", async () => {
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
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    vi.stubGlobal("fetch", fetchMock);

    const { router } = renderEditorWithDataRouter();

    const precursorTypeInput = await screen.findByLabelText("前驱体类型 1");
    vi.useFakeTimers();
    fireEvent.change(precursorTypeInput, { target: { value: "WO3" } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
      await Promise.resolve();
    });

    vi.useRealTimers();
    expect(await screen.findByText("Precursor save failed")).toBeInTheDocument();

    await act(async () => {
      void router.navigate("/experiments/exp-1");
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.queryByText("Experiment detail route")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "基础信息" })).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await act(async () => {
      void router.navigate("/experiments/exp-1");
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("Experiment detail route")).toBeInTheDocument();
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
