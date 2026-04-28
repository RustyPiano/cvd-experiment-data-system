import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ExperimentDetailPage } from "./experiment-detail-page";
import { ExperimentEditorPage } from "./experiment-editor-page";
import { renderWithApp } from "../../test/render";

describe("Experiment detail-like pages", () => {
  afterEach(() => {
    cleanup();
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

  it("shows file overview, audit trail, and export actions for a visible experiment", async () => {
    const requests: Array<{ method: string; pathname: string; search: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      requests.push({
        method,
        pathname: url.pathname,
        search: url.search,
      });

      if (url.pathname === "/api/v1/experiments/exp-1" && method === "GET") {
        return new Response(
          JSON.stringify({
            id: "exp-1",
            run_code: "CVD-2026-0001",
            owner_id: "u-1",
            derived_from_run_id: null,
            derived_from_run_code: null,
            recipe_id: null,
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
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/api/v1/files" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "file-1",
                experiment_run_id: "exp-1",
                sample_id: "sample-1",
                uploaded_by_id: "u-1",
                deleted_by_id: null,
                original_name: "raman.txt",
                storage_path: "CVD-2026-0001/file-1-raman.txt",
                download_url: "/api/v1/files/file-1/download",
                content_type: "text/plain",
                size_bytes: 8,
                sha256: "hash-1",
                method: "Raman",
                file_category: "raw",
                note: "primary spectrum",
                metadata_json: {},
                created_at: "2026-04-23T00:10:00Z",
                updated_at: "2026-04-23T00:10:00Z",
                deleted_at: null,
                is_deleted: false,
              },
            ],
            total: 1,
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/api/v1/samples" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "sample-1",
                sample_code: "S-2026-0001-TOP",
                experiment_run_id: "exp-1",
                parent_sample_id: null,
                role: "top",
                substrate_type: "SiO2/Si",
                brand: "MTI",
                size_mm: "10x10",
                treatment: "acetone",
                position_mm: 12.5,
                storage_location: null,
                metadata_json: {},
                created_at: "2026-04-23T00:00:00Z",
                updated_at: "2026-04-23T00:00:00Z",
              },
            ],
            total: 1,
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/api/v1/experiments/exp-1/audit-events" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "audit-1",
                actor_id: "u-1",
                entity_type: "experiment_run",
                entity_id: "exp-1",
                action: "upload_file",
                before_json: null,
                after_json: { file_id: "file-1" },
                reason: "file-1",
                created_at: "2026-04-23T00:11:00Z",
              },
            ],
            total: 1,
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/api/v1/experiments/exp-1/modules" && method === "GET") {
        return new Response(
          JSON.stringify({
            items: [],
            total: 0,
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/api/v1/experiments/exp-1/export/json" && method === "GET") {
        return new Response(
          JSON.stringify({
            export_version: "cvd_export_v1",
            exported_at: "2026-04-23T00:12:00Z",
            experiment: { id: "exp-1", run_code: "CVD-2026-0001" },
          }),
          {
            headers: { "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      if (url.pathname === "/api/v1/experiments/exp-1/export/excel" && method === "GET") {
        return new Response(new Blob(["excel-bytes"]), {
          headers: {
            "Content-Disposition": 'attachment; filename="experiment-exp-1.xlsx"',
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          status: 200,
        });
      }

      return new Response("Not found", { status: 404 });
    });

    vi.stubGlobal("fetch", fetchMock);
    globalThis.URL.createObjectURL = vi.fn(() => "blob:download");
    globalThis.URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
        <Route path="/samples/:sampleId" element={<div>样品详情路由</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
      },
    );

    // Overview tab is active by default
    expect(await screen.findByRole("button", { name: "导出 JSON" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 Excel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "管理文件" })).toBeInTheDocument();

    // Switch to Files tab
    fireEvent.click(screen.getByRole("tab", { name: "文件" }));
    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    // Switch to Audit tab
    fireEvent.click(screen.getByRole("tab", { name: "审计" }));
    expect(await screen.findByText("upload_file")).toBeInTheDocument();

    // Switch to Samples tab
    fireEvent.click(screen.getByRole("tab", { name: "样品" }));
    expect(await screen.findByLabelText("查看样品 S-2026-0001-TOP")).toBeInTheDocument();

    // Switch back to Overview and click exports
    fireEvent.click(screen.getByRole("tab", { name: "概览" }));
    fireEvent.click(screen.getByRole("button", { name: "导出 JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "导出 Excel" }));

    await waitFor(() => {
      expect(
        requests.some(
          (request) =>
            request.method === "GET" &&
            request.pathname === "/api/v1/experiments/exp-1/export/json",
        ),
      ).toBe(true);
      expect(
        requests.some(
          (request) =>
            request.method === "GET" &&
            request.pathname === "/api/v1/experiments/exp-1/export/excel",
        ),
      ).toBe(true);
    });

    expect(clickSpy).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByLabelText("查看样品 S-2026-0001-TOP"));
    expect(await screen.findByText("样品详情路由")).toBeInTheDocument();
  });

  it("shows source banner when the experiment is cloned from another run", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
        const method = init?.method ?? "GET";

        if (url.pathname === "/api/v1/experiments/exp-2" && method === "GET") {
          return new Response(
            JSON.stringify({
              id: "exp-2",
              run_code: "CVD-2026-0009",
              owner_id: "u-1",
              derived_from_run_id: "exp-1",
              derived_from_run_code: "CVD-2026-0001",
              recipe_id: null,
              experiment_type: "cvd_2zone",
              material_system: "MoS2",
              experiment_date: "2026-04-24",
              objective: "Clone check",
              status: "draft",
              quality_label: "unknown",
              summary_result: null,
              invalid_reason: null,
              created_at: "2026-04-24T00:00:00Z",
              updated_at: "2026-04-24T00:00:00Z",
              submitted_at: null,
              locked_at: null,
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (url.pathname === "/api/v1/files" || url.pathname === "/api/v1/samples") {
          return new Response(
            JSON.stringify({
              items: [],
              total: 0,
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (url.pathname === "/api/v1/experiments/exp-2/audit-events") {
          return new Response(
            JSON.stringify({
              items: [],
              total: 0,
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        if (url.pathname === "/api/v1/experiments/exp-2/modules") {
          return new Response(
            JSON.stringify({
              items: [
                {
                  id: "mod-env",
                  experiment_run_id: "exp-2",
                  module_key: "environment",
                  schema_version: "1",
                  payload_json: {
                    indoor_temperature_C: 24,
                    indoor_humidity_percent: 45,
                    sample_env: "room",
                    abnormal_note: "",
                  },
                  note: null,
                  created_at: "2026-04-24T00:00:00Z",
                  updated_at: "2026-04-24T00:00:00Z",
                },
                {
                  id: "mod-precheck",
                  experiment_run_id: "exp-2",
                  module_key: "precheck",
                  schema_version: "1",
                  payload_json: {
                    seal_intact: true,
                    risk_note: "复核密封圈",
                    hood_clean: null,
                    flange_blocked: false,
                    boat_contamination_level: false,
                    tube_contamination_level: true,
                  },
                  note: null,
                  created_at: "2026-04-24T00:00:00Z",
                  updated_at: "2026-04-24T00:00:00Z",
                },
                {
                  id: "mod-precursors",
                  experiment_run_id: "exp-2",
                  module_key: "precursors",
                  schema_version: "1",
                  payload_json: {
                    items: [
                      {
                        species: "MoO3",
                        brand: "Sigma",
                        melting_temperature_C: 795,
                        spin_speed_rpm: 3000,
                        preparation_time_min: 15,
                      },
                    ],
                  },
                  note: null,
                  created_at: "2026-04-24T00:00:00Z",
                  updated_at: "2026-04-24T00:00:00Z",
                },
                {
                  id: "mod-substrates",
                  experiment_run_id: "exp-2",
                  module_key: "substrates",
                  schema_version: "1",
                  payload_json: {
                    items: [
                      {
                        role: "top",
                        type: "SiO2/Si",
                        treatment_method: "plasma",
                        treatment_params: {
                          temperature_C: 120,
                          duration_min: 10,
                          power_W: 80,
                          gas: "Ar",
                        },
                      },
                    ],
                  },
                  note: null,
                  created_at: "2026-04-24T00:00:00Z",
                  updated_at: "2026-04-24T00:00:00Z",
                },
                {
                  id: "mod-gas",
                  experiment_run_id: "exp-2",
                  module_key: "gas_program",
                  schema_version: "1",
                  payload_json: {
                    pre_washing_gas: "Ar",
                    segments: [
                      {
                        stage: "growth",
                        gas: "Ar/H2",
                        start_min: 0,
                        end_min: 30,
                        flow_sccm: 80,
                        components: [
                          { name: "Ar", fraction: 95 },
                          { name: "H2", fraction: 5 },
                        ],
                      },
                    ],
                  },
                  note: null,
                  created_at: "2026-04-24T00:00:00Z",
                  updated_at: "2026-04-24T00:00:00Z",
                },
              ],
              total: 5,
            }),
            {
              headers: { "Content-Type": "application/json" },
              status: 200,
            },
          );
        }

        return new Response("Not found", { status: 404 });
      }),
    );

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-2"],
      },
    );

    expect(await screen.findByText("本实验派生自 CVD-2026-0001")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "参数" }));
    expect(await screen.findByText("样品环境：room")).toBeInTheDocument();
    const precheckCard = screen.getByText("预检查").closest(".ant-card");
    expect(precheckCard).not.toBeNull();
    const precheck = within(precheckCard as HTMLElement);
    expect(precheck.getByText("密封完好：是")).toBeInTheDocument();
    expect(precheck.getByText("通风橱清洁：未检查")).toBeInTheDocument();
    expect(precheck.getByText("法兰堵塞：否")).toBeInTheDocument();
    expect(precheck.getByText("瓷舟污染：否")).toBeInTheDocument();
    expect(precheck.getByText("石英管污染：是")).toBeInTheDocument();
    expect(precheck.getByText("风险说明：复核密封圈")).toBeInTheDocument();
    const precheckText = precheckCard?.textContent ?? "";
    expect(precheckText.indexOf("石英管污染：是")).toBeLessThan(
      precheckText.indexOf("风险说明：复核密封圈"),
    );
    expect(screen.getByText("预清洗气体：Ar")).toBeInTheDocument();
    expect(screen.getByText("Ar: 95%；H2: 5%")).toBeInTheDocument();
    expect(screen.getByText("795 °C / 3000 rpm / 15 min")).toBeInTheDocument();
    expect(screen.getByText("120 °C / 10 min / 80 W / Ar")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CVD-2026-0001" })).toHaveAttribute(
      "href",
      "/experiments/exp-1",
    );
  });
});
