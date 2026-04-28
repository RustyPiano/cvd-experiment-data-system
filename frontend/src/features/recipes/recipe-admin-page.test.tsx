import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { renderWithApp } from "../../test/render";
import { RecipeAdminPage } from "./recipe-admin-page";

type RecipeFixture = {
  id: string;
  name: string;
  template_version_id: string | null;
  project_id: string | null;
  material_system: string | null;
  default_payload_json: Record<string, unknown>;
  description: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function createRecipeServer() {
  const recipes: RecipeFixture[] = [
    {
      id: "recipe-1",
      name: "MoS2 baseline",
      template_version_id: null,
      project_id: null,
      material_system: "MoS2",
      default_payload_json: { furnace_program: { peak_temperature_c: 720 } },
      description: "标准 MoS2 生长窗口",
      created_by: "admin-1",
      is_active: true,
      created_at: "2026-04-28T01:00:00Z",
      updated_at: "2026-04-28T01:00:00Z",
    },
    {
      id: "recipe-2",
      name: "WS2 retired",
      template_version_id: null,
      project_id: null,
      material_system: "WS2",
      default_payload_json: {},
      description: "旧版 WS2 条件",
      created_by: "admin-2",
      is_active: false,
      created_at: "2026-04-28T02:00:00Z",
      updated_at: "2026-04-28T02:00:00Z",
    },
  ];

  const materialVocabularies = [
    {
      id: "vocab-1",
      vocab_key: "material_system",
      value: "MoS2",
      label_zh: "MoS2",
      label_en: "MoS2",
      sort_order: 1,
      is_active: true,
      metadata_json: {},
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
    },
    {
      id: "vocab-2",
      vocab_key: "material_system",
      value: "WS2",
      label_zh: "WS2",
      label_en: "WS2",
      sort_order: 2,
      is_active: true,
      metadata_json: {},
      created_at: "2026-04-28T00:00:00Z",
      updated_at: "2026-04-28T00:00:00Z",
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

    if (url.pathname === "/api/v1/vocabularies" && method === "GET") {
      return new Response(JSON.stringify({ items: materialVocabularies, total: 2 }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/admin/recipes" && method === "GET") {
      const materialSystem = url.searchParams.get("material_system");
      const filteredRecipes = materialSystem
        ? recipes.filter((recipe) => recipe.material_system === materialSystem)
        : recipes;

      return new Response(JSON.stringify({ items: filteredRecipes, total: filteredRecipes.length }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/admin/recipes" && method === "POST") {
      const payload = JSON.parse(String(body));
      const created = {
        id: "recipe-3",
        template_version_id: null,
        project_id: null,
        created_by: "admin-1",
        is_active: true,
        created_at: "2026-04-28T03:00:00Z",
        updated_at: "2026-04-28T03:00:00Z",
        ...payload,
      };
      recipes.push(created);

      return new Response(JSON.stringify(created), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      });
    }

    if (url.pathname === "/api/v1/admin/recipes/recipe-1" && method === "PATCH") {
      const payload = JSON.parse(String(body));
      const current = recipes.find((recipe) => recipe.id === "recipe-1");
      if (!current) {
        return new Response("Not found", { status: 404 });
      }

      Object.assign(current, payload, {
        updated_at: "2026-04-28T04:00:00Z",
      });

      return new Response(JSON.stringify(current), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/admin/recipes/recipe-1" && method === "DELETE") {
      const current = recipes.find((recipe) => recipe.id === "recipe-1");
      if (current) {
        current.is_active = false;
      }
      return new Response(null, { status: 204 });
    }

    return new Response("Not found", { status: 404 });
  });

  return { fetchMock, requests };
}

function renderRecipeAdmin(userRole: "admin" | "member" = "admin") {
  return renderWithApp(
    <Routes>
      <Route path="/admin/recipes" element={<RecipeAdminPage />} />
    </Routes>,
    {
      authenticated: true,
      initialEntries: ["/admin/recipes"],
      user: {
        id: `${userRole}-1`,
        email: `${userRole}@example.com`,
        name: userRole === "admin" ? "Admin" : "Member",
        role: userRole,
        is_active: true,
        last_login_at: null,
      },
    },
  );
}

describe("RecipeAdminPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads admin recipes and applies a material system filter", async () => {
    const user = userEvent.setup();
    const server = createRecipeServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderRecipeAdmin();

    expect(await screen.findByText("MoS2 baseline")).toBeInTheDocument();
    expect(screen.getByText("WS2 retired")).toBeInTheDocument();

    await user.click(screen.getByLabelText("材料体系筛选"));
    await user.click(await screen.findByRole("option", { name: "MoS2" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "GET" &&
            request.pathname === "/api/v1/admin/recipes" &&
            request.search.includes("material_system=MoS2"),
        ),
      ).toBe(true);
    });
  });

  it("creates a recipe with parsed default payload JSON", async () => {
    const user = userEvent.setup();
    const server = createRecipeServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderRecipeAdmin();

    expect(await screen.findByText("MoS2 baseline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增 Recipe" }));
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "WS2 baseline" } });
    fireEvent.change(screen.getByLabelText("创建材料体系"), { target: { value: "WS2" } });
    fireEvent.change(screen.getByLabelText("描述"), { target: { value: "新 Recipe 描述" } });
    fireEvent.change(screen.getByLabelText("默认 payload JSON"), {
      target: { value: '{\n  "gas_program": {\n    "carrier": "Ar"\n  }\n}' },
    });
    await user.click(screen.getByRole("button", { name: "创建 Recipe" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) => request.method === "POST" && request.pathname === "/api/v1/admin/recipes",
        ),
      ).toBe(true);
    });

    const createRequest = server.requests.find(
      (request) => request.method === "POST" && request.pathname === "/api/v1/admin/recipes",
    );
    expect(JSON.parse(String(createRequest?.body))).toEqual({
      name: "WS2 baseline",
      material_system: "WS2",
      description: "新 Recipe 描述",
      default_payload_json: {
        gas_program: {
          carrier: "Ar",
        },
      },
    });
    expect(await screen.findByText("Recipe 创建成功")).toBeInTheDocument();
  }, 10_000);

  it("edits a recipe and only patches changed fields", async () => {
    const user = userEvent.setup();
    const server = createRecipeServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderRecipeAdmin();

    expect(await screen.findByText("MoS2 baseline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑 MoS2 baseline" }));
    await user.clear(screen.getByLabelText("描述"));
    await user.type(screen.getByLabelText("描述"), "更新后的描述");
    fireEvent.change(screen.getByLabelText("默认 payload JSON"), {
      target: { value: '{\n  "furnace_program": {\n    "peak_temperature_c": 735\n  }\n}' },
    });
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "PATCH" &&
            request.pathname === "/api/v1/admin/recipes/recipe-1",
        ),
      ).toBe(true);
    });

    const patchRequest = server.requests.find(
      (request) =>
        request.method === "PATCH" && request.pathname === "/api/v1/admin/recipes/recipe-1",
    );
    expect(JSON.parse(String(patchRequest?.body))).toEqual({
      description: "更新后的描述",
      default_payload_json: {
        furnace_program: {
          peak_temperature_c: 735,
        },
      },
    });
    expect(await screen.findByText("Recipe 更新成功")).toBeInTheDocument();
  }, 10_000);

  it("deactivates a recipe after confirmation", async () => {
    const user = userEvent.setup();
    const server = createRecipeServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderRecipeAdmin();

    expect(await screen.findByText("MoS2 baseline")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "停用 MoS2 baseline" }));
    const dialog = await screen.findByRole("tooltip");
    await user.click(within(dialog).getByRole("button", { name: "确认停用" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "DELETE" &&
            request.pathname === "/api/v1/admin/recipes/recipe-1",
        ),
      ).toBe(true);
    });
    expect(await screen.findByText("Recipe 已停用")).toBeInTheDocument();
  });

  it("shows a permission warning for non-admin users without admin requests", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderRecipeAdmin("member");

    expect(screen.getByText("当前账号没有 Recipe 管理权限。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增 Recipe" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
