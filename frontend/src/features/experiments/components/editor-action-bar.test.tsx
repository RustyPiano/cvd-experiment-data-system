import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExperimentRead } from "../../../shared/types/api";
import { EditorActionBar } from "./editor-action-bar";

const experiment: ExperimentRead = {
  id: "exp-1",
  run_code: "CVD-2026-001",
  status: "draft",
  owner_id: "user-1",
  derived_from_run_id: null,
  derived_from_run_code: null,
  recipe_id: null,
  experiment_type: "growth",
  material_system: "MoS2",
  experiment_date: "2026-04-28",
  objective: null,
  summary_result: null,
  quality_label: "unknown",
  invalid_reason: null,
  created_at: "2026-04-28T00:00:00Z",
  updated_at: "2026-04-28T00:00:00Z",
  submitted_at: null,
  locked_at: null,
};

describe("EditorActionBar", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows total completion progress next to save status", () => {
    const { getByText } = render(
      <EditorActionBar
        completionSummary={{
          blockingCount: 1,
          completedCount: 7,
          percent: 72,
          totalCount: 10,
          warningCount: 3,
        }}
        experiment={experiment}
        isDraft
        onBack={vi.fn()}
        onSubmit={vi.fn()}
        saveSummary="草稿已自动保存"
        submitState={{ status: "idle", message: null }}
      />,
    );

    expect(getByText("总完成度 72% · 已完成 7/10 · 阻塞 1 · 提示 3")).toBeTruthy();
  });
});
