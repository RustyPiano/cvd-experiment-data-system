import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { SampleDetailPage } from "./sample-detail-page";
import { renderWithApp } from "../../test/render";

function createSampleServer(options?: {
  deferPatch?: boolean;
  experimentStatus?: "draft" | "locked";
  viewer?: boolean;
}) {
  const sample = {
    id: "sample-1",
    sample_code: "S-2026-0001-TOP",
    experiment_run_id: "exp-1",
    parent_sample_id: null,
    role: "top",
    substrate_type: "SiO2/Si",
    brand: "MTI",
    size_mm: "10x10",
    treatment: "acetone clean",
    position_mm: 12.5,
    storage_location: "drawer-1",
    metadata_json: {
      batch: "A1",
    },
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
  };

  const experiment = {
    id: "exp-1",
    run_code: "CVD-2026-0001",
    owner_id: options?.viewer ? "u-2" : "u-1",
    derived_from_run_id: null,
    experiment_type: "cvd_2zone",
    material_system: "MoS2",
    experiment_date: "2026-04-23",
    objective: "Sample inspection",
    status: options?.experimentStatus ?? "draft",
    quality_label: "unknown",
    summary_result: null,
    invalid_reason: null,
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
    submitted_at: null,
    locked_at: null,
  };

  const files = [
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
      note: "baseline spectrum",
      metadata_json: {},
      created_at: "2026-04-23T00:10:00Z",
      updated_at: "2026-04-23T00:10:00Z",
      deleted_at: null,
      is_deleted: false,
    },
  ];

  const requests: Array<{ body: unknown; method: string; pathname: string; search: string }> = [];
  let completePatch: (() => void) | null = null;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    const method = init?.method ?? "GET";
    const body = init?.body ?? null;

    requests.push({
      body,
      method,
      pathname: url.pathname,
      search: url.search,
    });

    if (url.pathname === "/api/v1/samples/sample-1" && method === "GET") {
      return new Response(JSON.stringify(sample), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/experiments/exp-1" && method === "GET") {
      return new Response(JSON.stringify(experiment), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/files" && method === "GET") {
      return new Response(JSON.stringify({ items: files, total: files.length }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/samples/sample-1" && method === "PATCH") {
      const payload = JSON.parse(String(body));
      const buildPatchResponse = () => {
        Object.assign(sample, payload, {
          updated_at: "2026-04-23T00:20:00Z",
        });

        return new Response(JSON.stringify(sample), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      };

      if (options?.deferPatch) {
        return new Promise<Response>((resolve) => {
          completePatch = () => {
            resolve(buildPatchResponse());
          };
        });
      }

      return buildPatchResponse();
    }

    return new Response("Not found", { status: 404 });
  });

  return {
    completePatch: () => {
      completePatch?.();
    },
    fetchMock,
    requests,
  };
}

describe("SampleDetailPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads a sample, shows related files, and saves only dirty fields", async () => {
    const server = createSampleServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/samples/:sampleId" element={<SampleDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/samples/sample-1"],
      },
    );

    expect(await screen.findByText("S-2026-0001-TOP")).toBeInTheDocument();
    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("基底类型"), {
      target: { value: "Sapphire" },
    });
    fireEvent.change(screen.getByLabelText("位置 (mm)"), {
      target: { value: "18.5" },
    });
    fireEvent.change(screen.getByLabelText("元数据 JSON"), {
      target: { value: '{\n  "batch": "A2"\n}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存样品" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) => request.method === "PATCH" && request.pathname === "/api/v1/samples/sample-1",
        ),
      ).toBe(true);
    });

    const saveRequest = server.requests.find(
      (request) => request.method === "PATCH" && request.pathname === "/api/v1/samples/sample-1",
    );
    expect(JSON.parse(String(saveRequest?.body))).toEqual({
      substrate_type: "Sapphire",
      position_mm: 18.5,
      metadata_json: {
        batch: "A2",
      },
    });

    expect(await screen.findByText("样品保存成功")).toBeInTheDocument();
  });

  it("falls back to read-only when the sample is not editable", async () => {
    const server = createSampleServer({ experimentStatus: "locked" });
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/samples/:sampleId" element={<SampleDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/samples/sample-1"],
      },
    );

    expect(await screen.findByText("S-2026-0001-TOP")).toBeInTheDocument();
    expect(await screen.findByText("当前样品来自非 draft 实验，暂不可编辑。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "保存样品" })).not.toBeInTheDocument();
  });

  it("disables the sample form while a save request is in flight", async () => {
    const server = createSampleServer({ deferPatch: true });
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/samples/:sampleId" element={<SampleDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/samples/sample-1"],
      },
    );

    expect(await screen.findByText("S-2026-0001-TOP")).toBeInTheDocument();
    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("存放位置"), {
      target: { value: "drawer-2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存样品" }));

    await waitFor(() => {
      expect(screen.getByLabelText("基底类型")).toBeDisabled();
      expect(screen.getByLabelText("元数据 JSON")).toBeDisabled();
    });

    server.completePatch();

    expect(await screen.findByText("样品保存成功")).toBeInTheDocument();
  });

  it("rejects non-finite position values before sending a patch", async () => {
    const server = createSampleServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/samples/:sampleId" element={<SampleDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/samples/sample-1"],
      },
    );

    expect(await screen.findByText("S-2026-0001-TOP")).toBeInTheDocument();
    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("位置 (mm)"), {
      target: { value: "1e309" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存样品" }));

    expect(await screen.findByText("位置 (mm) 必须是有限数字")).toBeInTheDocument();
    expect(
      server.requests.some(
        (request) => request.method === "PATCH" && request.pathname === "/api/v1/samples/sample-1",
      ),
    ).toBe(false);
  });
});
