import { QueryClient } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { VocabularyAdminPage } from "./vocabulary-admin-page";
import { renderWithApp } from "../../test/render";

function createVocabularyServer() {
  const vocabularyItems = [
    {
      id: "vocab-1",
      vocab_key: "material_system",
      value: "MoS2",
      label_zh: "MoS2",
      label_en: "MoS2",
      sort_order: 1,
      is_active: true,
      metadata_json: {},
      created_at: "2026-04-23T00:00:00Z",
      updated_at: "2026-04-23T00:00:00Z",
    },
    {
      id: "vocab-2",
      vocab_key: "substrate_type",
      value: "sapphire",
      label_zh: "蓝宝石",
      label_en: "Sapphire",
      sort_order: 2,
      is_active: false,
      metadata_json: { source: "legacy" },
      created_at: "2026-04-23T00:00:00Z",
      updated_at: "2026-04-23T00:00:00Z",
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

    if (url.pathname === "/api/v1/admin/vocabularies" && method === "GET") {
      const vocabKey = url.searchParams.get("vocab_key");
      const filteredItems = vocabKey
        ? vocabularyItems.filter((item) => item.vocab_key === vocabKey)
        : vocabularyItems;

      return new Response(JSON.stringify({ items: filteredItems, total: filteredItems.length }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (url.pathname === "/api/v1/admin/vocabularies" && method === "POST") {
      const payload = JSON.parse(String(body));
      const created = {
        id: "vocab-3",
        created_at: "2026-04-23T00:05:00Z",
        updated_at: "2026-04-23T00:05:00Z",
        ...payload,
      };
      vocabularyItems.push(created);

      return new Response(JSON.stringify(created), {
        headers: { "Content-Type": "application/json" },
        status: 201,
      });
    }

    if (url.pathname === "/api/v1/admin/vocabularies/vocab-2" && method === "PATCH") {
      const payload = JSON.parse(String(body));
      const current = vocabularyItems.find((item) => item.id === "vocab-2");
      if (!current) {
        return new Response("Not found", { status: 404 });
      }

      Object.assign(current, payload, {
        updated_at: "2026-04-23T00:06:00Z",
      });

      return new Response(JSON.stringify(current), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response("Not found", { status: 404 });
  });

  return { fetchMock, requests };
}

describe("VocabularyAdminPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads admin vocabularies and applies a vocab_key filter", async () => {
    const user = userEvent.setup();
    const server = createVocabularyServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/admin/vocabularies" element={<VocabularyAdminPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/admin/vocabularies"],
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(await screen.findByText("蓝宝石")).toBeInTheDocument();
    expect(screen.getByText("蓝宝石")).toBeInTheDocument();

    await user.click(screen.getByLabelText("词表 key 筛选"));
    await user.click(await screen.findByRole("option", { name: "substrate_type" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "GET" &&
            request.pathname === "/api/v1/admin/vocabularies" &&
            request.search.includes("vocab_key=substrate_type"),
        ),
      ).toBe(true);
    });

    await user.click(screen.getByLabelText("词表 key 筛选"));
    expect(await screen.findByRole("option", { name: "material_system" })).toBeInTheDocument();
  });

  it("creates a vocabulary entry and refreshes the table", async () => {
    const user = userEvent.setup();
    const server = createVocabularyServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/admin/vocabularies" element={<VocabularyAdminPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/admin/vocabularies"],
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(await screen.findByText("蓝宝石")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增词条" }));
    await user.type(screen.getByLabelText("词表 key"), "gas_label");
    await user.type(screen.getByLabelText("值"), "N2");
    await user.type(screen.getByLabelText("中文标签"), "氮气");
    await user.type(screen.getByLabelText("英文标签"), "Nitrogen");
    await user.clear(screen.getByLabelText("排序"));
    await user.type(screen.getByLabelText("排序"), "9");
    fireEvent.change(screen.getByLabelText("元数据 JSON"), {
      target: { value: '{\n  "source": "manual"\n}' },
    });
    await user.click(screen.getByRole("button", { name: "创建词条" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" && request.pathname === "/api/v1/admin/vocabularies",
        ),
      ).toBe(true);
    });

    const createRequest = server.requests.find(
      (request) => request.method === "POST" && request.pathname === "/api/v1/admin/vocabularies",
    );
    expect(JSON.parse(String(createRequest?.body))).toEqual({
      vocab_key: "gas_label",
      value: "N2",
      label_zh: "氮气",
      label_en: "Nitrogen",
      sort_order: 9,
      is_active: true,
      metadata_json: {
        source: "manual",
      },
    });

    expect(await screen.findByText("氮气")).toBeInTheDocument();
    expect(screen.getByText("词条创建成功")).toBeInTheDocument();
  }, 10_000);

  it("edits an existing vocabulary entry and only patches changed fields", async () => {
    const user = userEvent.setup();
    const server = createVocabularyServer();
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/admin/vocabularies" element={<VocabularyAdminPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/admin/vocabularies"],
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(await screen.findByText("蓝宝石")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "编辑 substrate_type:sapphire" }));
    await user.clear(screen.getByLabelText("中文标签"));
    await user.type(screen.getByLabelText("中文标签"), "蓝宝石片");
    await user.click(screen.getByRole("switch", { name: "启用" }));
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "PATCH" &&
            request.pathname === "/api/v1/admin/vocabularies/vocab-2",
        ),
      ).toBe(true);
    });

    const patchRequest = server.requests.find(
      (request) =>
        request.method === "PATCH" && request.pathname === "/api/v1/admin/vocabularies/vocab-2",
    );
    expect(JSON.parse(String(patchRequest?.body))).toEqual({
      label_zh: "蓝宝石片",
      is_active: true,
    });

    expect(await screen.findByText("蓝宝石片")).toBeInTheDocument();
    expect(screen.getByText("词条更新成功")).toBeInTheDocument();
  });

  it("shows a permission warning for non-admin users", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/admin/vocabularies" element={<VocabularyAdminPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/admin/vocabularies"],
        user: {
          id: "member-1",
          email: "member@example.com",
          name: "Member",
          role: "member",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(screen.getByText("当前账号没有词表管理权限。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新增词条" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("invalidates shared vocabulary caches after a successful mutation", async () => {
    const user = userEvent.setup();
    const server = createVocabularyServer();
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const sharedVocabularyKey = ["vocabularies", "characterization_method", "admin-1"];
    queryClient.setQueryData(sharedVocabularyKey, {
      items: [
        {
          id: "legacy-1",
          value: "Raman",
        },
      ],
    });
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/admin/vocabularies" element={<VocabularyAdminPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/admin/vocabularies"],
        queryClient,
        user: {
          id: "admin-1",
          email: "admin@example.com",
          name: "Admin",
          role: "admin",
          is_active: true,
          last_login_at: null,
        },
      },
    );

    expect(await screen.findByText("蓝宝石")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "新增词条" }));
    await user.type(screen.getByLabelText("词表 key"), "characterization_method");
    await user.type(screen.getByLabelText("值"), "XRD");
    await user.type(screen.getByLabelText("中文标签"), "X 射线衍射");
    await user.click(screen.getByRole("button", { name: "创建词条" }));

    await waitFor(() => {
      expect(queryClient.getQueryState(sharedVocabularyKey)?.isInvalidated).toBe(true);
    });
  });
});
