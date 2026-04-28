import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";

import { ExperimentDetailPage } from "./experiment-detail-page";
import { ExperimentEditorPage } from "./experiment-editor-page";
import { renderWithApp } from "../../test/render";
import type { SessionUser } from "../auth/auth-store";
import type { RecipeRead } from "../../shared/types/api";

type ExperimentFixture = {
  id: string;
  run_code: string;
  owner_id: string;
  derived_from_run_id: string | null;
  derived_from_run_code: string | null;
  recipe_id: string | null;
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

const ownerUser: SessionUser = {
  id: "u-1",
  email: "owner@example.com",
  name: "Owner",
  role: "member",
  is_active: true,
  last_login_at: null,
};

const anotherMember: SessionUser = {
  id: "u-2",
  email: "viewer@example.com",
  name: "Other Member",
  role: "member",
  is_active: true,
  last_login_at: null,
};

const viewerUser: SessionUser = {
  id: "u-3",
  email: "viewer@example.com",
  name: "Viewer",
  role: "viewer",
  is_active: true,
  last_login_at: null,
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

function createExperiment(status: ExperimentFixture["status"]): ExperimentFixture {
  return {
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
    status,
    quality_label: "unknown",
    summary_result: status === "invalid" ? "Discarded run" : null,
    invalid_reason: status === "invalid" ? "Contaminated substrate" : null,
    created_at: "2026-04-23T00:00:00Z",
    updated_at: "2026-04-23T00:00:00Z",
    submitted_at: status === "submitted" || status === "locked" ? "2026-04-23T01:00:00Z" : null,
    locked_at: status === "locked" ? "2026-04-23T02:00:00Z" : null,
  };
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

function createLifecycleFetchMock(initialExperiment: ExperimentFixture) {
  const experiment = { ...initialExperiment };
  const clonedExperiment: ExperimentFixture = {
    ...initialExperiment,
    id: "exp-2",
    run_code: "CVD-2026-0002",
    owner_id: "u-2",
    derived_from_run_id: initialExperiment.id,
    derived_from_run_code: initialExperiment.run_code,
    recipe_id: null,
    experiment_date: "2026-04-24",
    status: "draft",
    summary_result: null,
    invalid_reason: null,
    submitted_at: null,
    locked_at: null,
    updated_at: "2026-04-24T00:00:00Z",
  };
  const cloneModules = [
    createModulePayload(clonedExperiment.id, "environment", {
      indoor_temperature_C: 25,
      sample_env: "clean",
      abnormal_note: "",
    }),
  ];
  const savedRecipe: RecipeRead = {
    id: "recipe-1",
    name: "MoS2 baseline",
    template_version_id: null,
    project_id: null,
    material_system: initialExperiment.material_system,
    default_payload_json: {},
    description: "Baseline growth recipe",
    created_by: "u-2",
    is_active: true,
    created_at: "2026-04-24T01:00:00Z",
    updated_at: "2026-04-24T01:00:00Z",
  };
  const requests: Array<{ method: string; pathname: string; body: unknown }> = [];

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

    if (url.pathname === "/api/v1/experiments/exp-1/return-to-draft" && method === "POST") {
      experiment.status = "draft";
      experiment.submitted_at = null;
      experiment.locked_at = null;
      experiment.updated_at = "2026-04-23T03:00:00Z";
      return jsonResponse(experiment);
    }

    if (url.pathname === "/api/v1/experiments/exp-1/lock" && method === "POST") {
      experiment.status = "locked";
      experiment.locked_at = "2026-04-23T03:30:00Z";
      experiment.updated_at = "2026-04-23T03:30:00Z";
      return jsonResponse(experiment);
    }

    if (url.pathname === "/api/v1/experiments/exp-1/invalidate" && method === "POST") {
      experiment.status = "invalid";
      experiment.invalid_reason = (body as { reason?: string } | null)?.reason ?? null;
      experiment.updated_at = "2026-04-23T04:00:00Z";
      return jsonResponse(experiment);
    }

    if (url.pathname === "/api/v1/experiments/exp-1/clone" && method === "POST") {
      return jsonResponse(clonedExperiment, { status: 201 });
    }

    if (url.pathname === "/api/v1/experiments/exp-1/save-as-recipe" && method === "POST") {
      return jsonResponse(
        {
          ...savedRecipe,
          name: (body as { name?: string } | null)?.name ?? savedRecipe.name,
          description:
            (body as { description?: string } | null)?.description ?? savedRecipe.description,
        },
        { status: 201 },
      );
    }

    if (url.pathname === "/api/v1/experiments/exp-2" && method === "GET") {
      return jsonResponse(clonedExperiment);
    }

    if (url.pathname === "/api/v1/experiments/exp-2/modules" && method === "GET") {
      return jsonResponse({
        items: cloneModules,
        total: cloneModules.length,
      });
    }

    return new Response("Not found", { status: 404 });
  });

  return {
    experiment,
    requests,
    fetchMock,
  };
}

describe("Experiment state actions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("returns a submitted experiment to draft for the owner", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: ownerUser,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "退回草稿" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/experiments/exp-1/return-to-draft",
        ),
      ).toBe(true);
    });

    expect((await screen.findAllByText("草稿")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /继续编辑/ })).toBeInTheDocument();
  });

  it("locks a submitted experiment for the owner", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: ownerUser,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "锁定实验" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" && request.pathname === "/api/v1/experiments/exp-1/lock",
        ),
      ).toBe(true);
    });

    expect((await screen.findAllByText("已锁定")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "派生草稿" })).toBeInTheDocument();
  });

  it("disables sibling lifecycle actions while a transition is in flight", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    let releaseLockRequest!: () => void;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/experiments/exp-1/lock" && method === "POST") {
        return new Promise<Response>((resolve) => {
          releaseLockRequest = () => {
            void server.fetchMock(input, init).then(resolve);
          };
        });
      }

      return server.fetchMock(input, init);
    });

    vi.stubGlobal("fetch", fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: ownerUser,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "锁定实验" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "退回草稿" })).toBeDisabled();
      expect(screen.getByRole("button", { name: /锁定实验/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "作废实验" })).toBeDisabled();
    });

    releaseLockRequest();

    expect((await screen.findAllByText("已锁定")).length).toBeGreaterThan(0);
  });

  it("requires a reason before invalidating a draft experiment", async () => {
    const server = createLifecycleFetchMock(createExperiment("draft"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: ownerUser,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "作废实验" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "确认作废" }));
    expect(await screen.findByText("请填写作废原因")).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("作废原因"), {
      target: { value: "Contaminated substrate" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认作废" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/experiments/exp-1/invalidate" &&
            (request.body as { reason?: string } | null)?.reason === "Contaminated substrate",
        ),
      ).toBe(true);
    });

    expect((await screen.findAllByText("已作废")).length).toBeGreaterThan(0);
    expect(screen.getByText("Contaminated substrate")).toBeInTheDocument();
  });

  it("allows the owner to invalidate a submitted experiment", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: ownerUser,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "作废实验" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("作废原因"), {
      target: { value: "Oxidized tube wall" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "确认作废" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/experiments/exp-1/invalidate" &&
            (request.body as { reason?: string } | null)?.reason === "Oxidized tube wall",
        ),
      ).toBe(true);
    });

    expect((await screen.findAllByText("已作废")).length).toBeGreaterThan(0);
    expect(screen.getByText("Oxidized tube wall")).toBeInTheDocument();
  });

  it("allows non-viewer users to clone a locked experiment", async () => {
    const server = createLifecycleFetchMock(createExperiment("locked"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: anotherMember,
      },
    );

    expect(await screen.findByRole("button", { name: "派生草稿" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "作废实验" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "派生草稿" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" && request.pathname === "/api/v1/experiments/exp-1/clone",
        ),
      ).toBe(true);
    });

    expect(await screen.findByRole("heading", { name: "编辑 CVD-2026-0002" })).toBeInTheDocument();
  });

  it("allows the owner to clone a submitted experiment", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
        <Route path="/experiments/:experimentId/edit" element={<ExperimentEditorPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: ownerUser,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "派生草稿" }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" && request.pathname === "/api/v1/experiments/exp-1/clone",
        ),
      ).toBe(true);
    });

    expect(await screen.findByRole("heading", { name: "编辑 CVD-2026-0002" })).toBeInTheDocument();
  });

  it("hides owner-only lifecycle buttons from members viewing someone else's experiment", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: anotherMember,
      },
    );

    await screen.findByText("实验详情");
    expect(screen.queryByRole("button", { name: "退回草稿" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "锁定实验" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "作废实验" })).not.toBeInTheDocument();
  });

  it.each(["submitted", "locked"] as const)(
    "shows save as Recipe for non-viewer users viewing a %s experiment",
    async (status) => {
      const server = createLifecycleFetchMock(createExperiment(status));
      vi.stubGlobal("fetch", server.fetchMock);

      renderWithApp(
        <Routes>
          <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
        </Routes>,
        {
          authenticated: true,
          initialEntries: ["/experiments/exp-1"],
          user: anotherMember,
        },
      );

      expect(await screen.findByRole("button", { name: "保存为 Recipe" })).toBeInTheDocument();
    },
  );

  it("hides save as Recipe for draft experiments and viewer users", async () => {
    const draftServer = createLifecycleFetchMock(createExperiment("draft"));
    vi.stubGlobal("fetch", draftServer.fetchMock);

    const { unmount } = renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: ownerUser,
      },
    );

    await screen.findByText("实验详情");
    expect(screen.queryByRole("button", { name: "保存为 Recipe" })).not.toBeInTheDocument();
    unmount();

    const lockedServer = createLifecycleFetchMock(createExperiment("locked"));
    vi.stubGlobal("fetch", lockedServer.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: viewerUser,
      },
    );

    await screen.findByText("实验详情");
    expect(screen.queryByRole("button", { name: "保存为 Recipe" })).not.toBeInTheDocument();
  });

  it("saves a submitted experiment as a Recipe from the modal", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: anotherMember,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "保存为 Recipe" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Recipe 名称"), {
      target: { value: "MoS2 baseline" },
    });
    fireEvent.change(within(dialog).getByLabelText("Recipe 描述"), {
      target: { value: "Baseline growth recipe" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /保\s*存/ }));

    await waitFor(() => {
      expect(
        server.requests.some(
          (request) =>
            request.method === "POST" &&
            request.pathname === "/api/v1/experiments/exp-1/save-as-recipe" &&
            (request.body as { name?: string; description?: string } | null)?.name ===
              "MoS2 baseline" &&
            (request.body as { name?: string; description?: string } | null)?.description ===
              "Baseline growth recipe",
        ),
      ).toBe(true);
    });

    expect(await screen.findByText("Recipe 已保存")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("validates save as Recipe name before submitting", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    vi.stubGlobal("fetch", server.fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: anotherMember,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "保存为 Recipe" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /保\s*存/ }));

    expect(await screen.findByText("请填写 Recipe 名称")).toBeInTheDocument();
    expect(
      server.requests.some(
        (request) =>
          request.method === "POST" &&
          request.pathname === "/api/v1/experiments/exp-1/save-as-recipe",
      ),
    ).toBe(false);
  });

  it("shows backend errors in the save as Recipe modal", async () => {
    const server = createLifecycleFetchMock(createExperiment("submitted"));
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
      const method = init?.method ?? "GET";

      if (url.pathname === "/api/v1/experiments/exp-1/save-as-recipe" && method === "POST") {
        return Promise.resolve(
          jsonResponse(
            { detail: "当前实验不能保存为 Recipe" },
            { status: 409 },
          ),
        );
      }

      return server.fetchMock(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithApp(
      <Routes>
        <Route path="/experiments/:experimentId" element={<ExperimentDetailPage />} />
      </Routes>,
      {
        authenticated: true,
        initialEntries: ["/experiments/exp-1"],
        user: anotherMember,
      },
    );

    fireEvent.click(await screen.findByRole("button", { name: "保存为 Recipe" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Recipe 名称"), {
      target: { value: "MoS2 baseline" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /保\s*存/ }));

    expect(await within(dialog).findByText("当前实验不能保存为 Recipe")).toBeInTheDocument();
  });
});
