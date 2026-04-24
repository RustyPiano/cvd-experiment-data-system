import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ExperimentFilesPage } from "./experiment-files-page";
import { renderWithApp } from "../../test/render";

type FileFixture = {
  id: string;
  experiment_run_id: string;
  sample_id: string | null;
  uploaded_by_id: string;
  deleted_by_id: string | null;
  original_name: string;
  storage_path: string;
  download_url: string;
  content_type: string | null;
  size_bytes: number;
  sha256: string;
  method: string;
  file_category: string;
  note: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  is_deleted: boolean;
};

function createFileServer() {
  const experiment = {
    id: "exp-1",
    run_code: "CVD-2026-0001",
    owner_id: "u-1",
    derived_from_run_id: null,
    derived_from_run_code: null,
    experiment_type: "cvd_2zone",
    material_system: "MoS2",
    experiment_date: "2026-04-23",
    objective: "File workflow",
    status: "draft",
    quality_label: "unknown",
    summary_result: null,
    invalid_reason: null,
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
    submitted_at: null,
    locked_at: null,
  };

  const samples = [
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
  ];

  const vocabularies = [
    {
      id: "vocab-1",
      vocab_key: "characterization_method",
      value: "Raman",
      label_zh: "拉曼",
      label_en: "Raman",
      sort_order: 1,
      is_active: true,
      metadata_json: {},
      created_at: "2026-04-23T00:00:00Z",
      updated_at: "2026-04-23T00:00:00Z",
    },
    {
      id: "vocab-2",
      vocab_key: "characterization_method",
      value: "OM",
      label_zh: "光学显微镜",
      label_en: "Optical Microscopy",
      sort_order: 2,
      is_active: true,
      metadata_json: {},
      created_at: "2026-04-23T00:00:00Z",
      updated_at: "2026-04-23T00:00:00Z",
    },
    {
      id: "vocab-3",
      vocab_key: "characterization_method",
      value: "SEM",
      label_zh: "扫描电镜",
      label_en: "SEM",
      sort_order: 3,
      is_active: true,
      metadata_json: {},
      created_at: "2026-04-23T00:00:00Z",
      updated_at: "2026-04-23T00:00:00Z",
    },
  ];

  const files: FileFixture[] = [
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
      note: "baseline",
      metadata_json: {},
      created_at: "2026-04-23T00:10:00Z",
      updated_at: "2026-04-23T00:10:00Z",
      deleted_at: null,
      is_deleted: false,
    },
    {
      id: "file-2",
      experiment_run_id: "exp-1",
      sample_id: null,
      uploaded_by_id: "u-1",
      deleted_by_id: null,
      original_name: "image.png",
      storage_path: "CVD-2026-0001/file-2-image.png",
      download_url: "/api/v1/files/file-2/download",
      content_type: "image/png",
      size_bytes: 10,
      sha256: "hash-2",
      method: "OM",
      file_category: "processed",
      note: "surface image",
      metadata_json: {},
      created_at: "2026-04-23T00:12:00Z",
      updated_at: "2026-04-23T00:12:00Z",
      deleted_at: null,
      is_deleted: false,
    },
  ];

  const requests: Array<{ body: unknown; method: string; pathname: string; search: string }> = [];

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

    if (url.pathname === "/api/v1/experiments/exp-1" && method === "GET") {
      return new Response(JSON.stringify(experiment), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/samples" && method === "GET") {
      return new Response(JSON.stringify({ items: samples, total: samples.length }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/vocabularies" && method === "GET") {
      return new Response(JSON.stringify({ items: vocabularies, total: vocabularies.length }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/files" && method === "GET") {
      const filtered = files.filter((item) => {
        if (url.searchParams.get("experiment_id") !== "exp-1") {
          return false;
        }
        const methodFilter = url.searchParams.get("method");
        const categoryFilter = url.searchParams.get("file_category");
        if (methodFilter && item.method !== methodFilter) {
          return false;
        }
        if (categoryFilter && item.file_category !== categoryFilter) {
          return false;
        }
        return true;
      });

      return new Response(JSON.stringify({ items: filtered, total: filtered.length }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/experiments/exp-1/files" && method === "POST") {
      const formData = body as FormData;
      const file = formData.get("file") as File;
      files.push({
        id: "file-3",
        experiment_run_id: "exp-1",
        sample_id: (formData.get("sample_id") as string) || null,
        uploaded_by_id: "u-1",
        deleted_by_id: null,
        original_name: file.name,
        storage_path: `CVD-2026-0001/file-3-${file.name}`,
        download_url: "/api/v1/files/file-3/download",
        content_type: file.type,
        size_bytes: file.size,
        sha256: "hash-3",
        method: String(formData.get("method")),
        file_category: String(formData.get("file_category")),
        note: (formData.get("note") as string) || null,
        metadata_json: {},
        created_at: "2026-04-23T00:15:00Z",
        updated_at: "2026-04-23T00:15:00Z",
        deleted_at: null,
        is_deleted: false,
      });

      return new Response(JSON.stringify(files.at(-1)), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      });
    }

    if (url.pathname === "/api/v1/files/file-2" && method === "DELETE") {
      const fileIndex = files.findIndex((item) => item.id === "file-2");
      files.splice(fileIndex, 1);
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  });

  return { fetchMock, requests };
}

describe("ExperimentFilesPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uploads a new file and refreshes the list", async () => {
    const user = userEvent.setup();
    const server = createFileServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/files" element={<ExperimentFilesPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/files"],
      },
    );

    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    await user.click(screen.getByLabelText("文件方法"));
    await user.click(await screen.findByRole("option", { name: "扫描电镜" }));
    await user.click(screen.getByLabelText("关联样品"));
    await user.click(await screen.findByRole("option", { name: "S-2026-0001-TOP" }));
    fireEvent.change(screen.getByLabelText("文件备注"), {
      target: { value: "surface image" },
    });
    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [new File(["png-bytes"], "sem.png", { type: "image/png" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传文件" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/experiments/exp-1/files",
        ),
      ).toBe(true);
    });

    const uploadRequest = server.requests.find(
      (request) =>
        request.method === "POST" && request.pathname === "/api/v1/experiments/exp-1/files",
    );
    const formData = uploadRequest?.body as FormData;
    expect(formData.get("method")).toBe("SEM");
    expect(formData.get("sample_id")).toBe("sample-1");
    expect(formData.get("note")).toBe("surface image");

    await waitFor(() => {
      expect(screen.getAllByText("sem.png").length).toBeGreaterThan(0);
    });
  }, 10_000);

  it("navigates to a sample detail route from the sample column", async () => {
    const server = createFileServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/files" element={<ExperimentFilesPage />} />
        <Route path="/samples/:sampleId" element={<div>样品详情路由</div>} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/files"],
      },
    );

    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "查看样品 S-2026-0001-TOP" }));

    expect(await screen.findByText("样品详情路由")).toBeInTheDocument();
  });

  it("blocks uploads until a file method is provided", async () => {
    const server = createFileServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/files" element={<ExperimentFilesPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/files"],
      },
    );

    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("选择文件"), {
      target: {
        files: [new File(["png-bytes"], "sem.png", { type: "image/png" })],
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "上传文件" }));

    expect(await screen.findByText("请先填写文件方法")).toBeInTheDocument();
    expect(
      server.requests.some(
        (request) =>
          request.method === "POST" && request.pathname === "/api/v1/experiments/exp-1/files",
      ),
    ).toBe(false);
  });

  it("filters files and deletes an existing draft asset", async () => {
    const user = userEvent.setup();
    const server = createFileServer();
    vi.stubGlobal("fetch", server.fetchMock);
    vi.stubGlobal("confirm", vi.fn(() => true));

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId/files" element={<ExperimentFilesPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1/files"],
      },
    );

    expect(await screen.findByText("raman.txt")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("筛选方法"), {
      target: { value: "OM" },
    });

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "GET" &&
            request.pathname === "/api/v1/files" &&
            request.search.includes("method=OM"),
        ),
      ).toBe(true);
    });

    expect(await screen.findByText("image.png")).toBeInTheDocument();
    expect(screen.queryByText("raman.txt")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "删除 image.png" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "DELETE" && request.pathname === "/api/v1/files/file-2",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByText("image.png")).not.toBeInTheDocument();
    });
  });
});
