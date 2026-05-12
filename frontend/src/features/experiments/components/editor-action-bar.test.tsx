import { cleanup, fireEvent, render } from "@testing-library/react";
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
    const { getByText, queryByText } = render(
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
        onSaveDraft={vi.fn()}
        onSubmit={vi.fn()}
        saveDraftLoading={false}
        saveSummary="✓ 已保存"
        submitState={{ status: "idle", message: null }}
      />,
    );

    expect(getByText("总完成度 72% · 已完成 7/10 · 阻塞 1 · 提示 3")).toBeTruthy();
    expect(queryByText("草稿会区块级自动保存；提交前会先执行后端校验。")).toBeNull();
  });

  it("keeps the footer focused on draft save and submit actions", () => {
    const onSaveDraft = vi.fn();
    const onSubmit = vi.fn();
    const { getByRole, queryByRole } = render(
      <EditorActionBar
        completionSummary={{
          blockingCount: 0,
          completedCount: 10,
          percent: 100,
          totalCount: 10,
          warningCount: 0,
        }}
        experiment={experiment}
        isDraft
        onSaveDraft={onSaveDraft}
        onSubmit={onSubmit}
        saveDraftLoading={false}
        saveSummary="编辑后自动保存"
        submitState={{ status: "idle", message: null }}
      />,
    );

    expect(queryByRole("button", { name: "上一步" })).toBeNull();
    expect(queryByRole("button", { name: "下一步" })).toBeNull();

    fireEvent.click(getByRole("button", { name: "保存草稿" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(getByRole("button", { name: "提交实验" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
