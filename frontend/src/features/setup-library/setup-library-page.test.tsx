import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithApp } from "../../test/render";
import { SetupLibraryPage } from "./setup-library-page";

type SetupLibraryFixture = {
  id: string;
  owner_id: string;
  owner_name: string | null;
  visibility: "private" | "group";
  is_active: boolean;
  name: string;
  institution: string | null;
  apparatus_description: string;
  methods_text: string;
  sample_placement_description: string;
  reaction_flow_description: string;
  reference_paper_url: string | null;
  unpublished_reason: string | null;
  has_diagram: boolean;
  diagram_original_name: string | null;
  diagram_download_url: string | null;
  content_hash: string;
  can_edit: boolean;
  semantic_context: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function createSetupLibraryServer() {
  const items: SetupLibraryFixture[] = [
    {
      id: "setup-1",
      owner_id: "member-1",
      owner_name: "Test User",
      visibility: "private",
      is_active: true,
      name: "Setup One",
      institution: "Tsinghua",
      apparatus_description: "Apparatus One",
      methods_text: "Methods One",
      sample_placement_description: "Placement One",
      reaction_flow_description: "Flow One",
      reference_paper_url: "https://doi.org/10.1038/s41586-020-0000-0",
      unpublished_reason: null,
      has_diagram: true,
      diagram_original_name: "diagram1.png",
      diagram_download_url: "/api/v1/setup-library/setup-1/diagram",
      content_hash: "hash1",
      can_edit: true,
      semantic_context: {},
      created_at: "2026-05-01T01:00:00Z",
      updated_at: "2026-05-01T01:00:00Z",
    },
    {
      id: "setup-2",
      owner_id: "member-2",
      owner_name: "Other User",
      visibility: "group",
      is_active: true,
      name: "Setup Two",
      institution: "Peking",
      apparatus_description: "Apparatus Two",
      methods_text: "Methods Two",
      sample_placement_description: "Placement Two",
      reaction_flow_description: "Flow Two",
      reference_paper_url: null,
      unpublished_reason: "Internal recipe only",
      has_diagram: false,
      diagram_original_name: null,
      diagram_download_url: null,
      content_hash: "hash2",
      can_edit: false,
      semantic_context: {},
      created_at: "2026-05-02T02:00:00Z",
      updated_at: "2026-05-02T02:00:00Z",
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

    if (url.pathname === "/api/v1/setup-library" && method === "GET") {
      return new Response(JSON.stringify({ items, total: items.length }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/setup-library" && method === "POST") {
      const payload = JSON.parse(String(body));
      const created: SetupLibraryFixture = {
        id: "setup-3",
        owner_id: "member-1",
        owner_name: "Test User",
        is_active: true,
        diagram_original_name: null,
        diagram_download_url: null,
        content_hash: "hash3",
        can_edit: true,
        semantic_context: {},
        created_at: "2026-05-03T03:00:00Z",
        updated_at: "2026-05-03T03:00:00Z",
        name: payload.name,
        institution: payload.institution ?? null,
        visibility: payload.visibility ?? "private",
        apparatus_description: payload.apparatus_description ?? "",
        methods_text: payload.methods_text ?? "",
        sample_placement_description: payload.sample_placement_description ?? "",
        reaction_flow_description: payload.reaction_flow_description ?? "",
        reference_paper_url: payload.reference_paper_url ?? null,
        unpublished_reason: payload.unpublished_reason ?? null,
        has_diagram: false,
      };
      items.push(created);

      return new Response(JSON.stringify(created), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      });
    }

    if (url.pathname.startsWith("/api/v1/setup-library/") && method === "PATCH") {
      const entryId = url.pathname.split("/").pop();
      const current = items.find((item) => item.id === entryId);
      if (!current) {
        return new Response("Not found", { status: 404 });
      }

      const payload = JSON.parse(String(body));
      Object.assign(current, payload, {
        updated_at: "2026-05-03T04:00:00Z",
      });

      return new Response(JSON.stringify(current), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname.startsWith("/api/v1/setup-library/") && method === "DELETE") {
      const entryId = url.pathname.split("/").pop();
      const current = items.find((item) => item.id === entryId);
      if (current) {
        current.is_active = false;
      }
      return new Response(null, { status: 204 });
    }

    if (
      url.pathname.startsWith("/api/v1/setup-library/") &&
      url.pathname.endsWith("/diagram") &&
      method === "POST"
    ) {
      const entryId = url.pathname.split("/")[4];
      const current = items.find((item) => item.id === entryId);
      if (current) {
        current.has_diagram = true;
        current.diagram_original_name = "diagram3.png";
        current.diagram_download_url = `/api/v1/setup-library/${entryId}/diagram`;

        return new Response(JSON.stringify(current), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      }
      return new Response("Not found", { status: 404 });
    }

    return new Response("Not found", { status: 404 });
  });

  return { fetchMock, requests };
}

function renderSetupLibrary(role: "member" | "viewer" | "admin" = "member") {
  return renderWithApp(
    <Routes>
      <Route path="/setup-library" element={<SetupLibraryPage />} />
    </Routes>,
    {
      authenticated: true,
      initialEntries: ["/setup-library"],
      user: {
        id: "member-1",
        email: "member@example.com",
        name: "Test User",
        role,
        is_active: true,
        last_login_at: null,
      },
    },
  );
}

describe("SetupLibraryPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads setup library entries and displays them in a table", async () => {
    const server = createSetupLibraryServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderSetupLibrary();

    expect(await screen.findByText("Setup One")).toBeInTheDocument();
    expect(screen.getByText("Setup Two")).toBeInTheDocument();
    expect(screen.getByText("私有")).toBeInTheDocument();
    expect(screen.getByText("群组")).toBeInTheDocument();
  });

  it("hides 新建 Setup for viewers (backend forbids them creating)", async () => {
    const server = createSetupLibraryServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderSetupLibrary("viewer");

    expect(await screen.findByText("Setup One")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /新建 Setup/ })).not.toBeInTheDocument();
  });

  it("opens the detail drawer when clicking 查看详情", async () => {
    const user = userEvent.setup();
    const server = createSetupLibraryServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderSetupLibrary();

    expect(await screen.findByText("Setup One")).toBeInTheDocument();

    const viewDetailsButtons = screen.getAllByRole("button", { name: "查看详情" });
    await user.click(viewDetailsButtons[0]);

    expect(await screen.findByText("Setup 详情: Setup One")).toBeInTheDocument();
    expect(screen.getByText("Methods One")).toBeInTheDocument();
    expect(screen.getByText("Apparatus One")).toBeInTheDocument();
  });

  it("creates a new setup library entry and handles cascade diagram upload", async () => {
    const user = userEvent.setup();
    const server = createSetupLibraryServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderSetupLibrary();

    expect(await screen.findByText("Setup One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /新建 Setup/ }));

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "New Setup" } });
    fireEvent.change(screen.getByLabelText("机构"), { target: { value: "Tsinghua Lab" } });
    await user.click(screen.getByLabelText("群组 (Group)"));
    fireEvent.change(screen.getByLabelText("实验方法/步骤"), { target: { value: "New Methods" } });
    fireEvent.change(screen.getByLabelText("未发表说明"), { target: { value: "Topic group recipe" } });

    fireEvent.change(screen.getByLabelText("示意图上传"), {
      target: {
        files: [new File(["diagram-bytes"], "diagram3.png", { type: "image/png" })],
      },
    });

    await user.click(screen.getByRole("button", { name: "确 定" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) => request.method === "POST" && request.pathname === "/api/v1/setup-library",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/setup-library/setup-3/diagram",
        ),
      ).toBe(true);
    });

    expect(await screen.findByText("保存成功")).toBeInTheDocument();
  }, 10_000);

  it("edits an existing setup library entry", async () => {
    const user = userEvent.setup();
    const server = createSetupLibraryServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderSetupLibrary();

    expect(await screen.findByText("Setup One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑" }));

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "Setup One Updated" } });

    await user.click(screen.getByRole("button", { name: "确 定" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "PATCH" &&
            request.pathname === "/api/v1/setup-library/setup-1",
        ),
      ).toBe(true);
    });

    const patchRequest = server.requests.find(
      (request) =>
        request.method === "PATCH" && request.pathname === "/api/v1/setup-library/setup-1",
    );
    const patchBody = JSON.parse(String(patchRequest?.body));
    expect(patchBody.name).toBe("Setup One Updated");
    expect(await screen.findByText("保存成功")).toBeInTheDocument();
  }, 10_000);

  it("deactivates a setup library entry after confirmation", async () => {
    const user = userEvent.setup();
    const server = createSetupLibraryServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderSetupLibrary();

    expect(await screen.findByText("Setup One")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停用" }));
    const dialog = await screen.findByRole("tooltip");
    await user.click(within(dialog).getByRole("button", { name: "确 定" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "DELETE" &&
            request.pathname === "/api/v1/setup-library/setup-1",
        ),
      ).toBe(true);
    });
    expect(await screen.findByText("停用成功")).toBeInTheDocument();
  });
});
