import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, test, vi, expect } from "vitest";

import { renderWithApp } from "../../../test/render";
import { SetupMethodsSection } from "./setup-methods-section";

const baseValue = {
  sourceTemplateKey: null,
  sourceTemplateVersion: null,
  setupNameSnapshot: "",
  institutionSnapshot: "",
  apparatusDescriptionSnapshot: "",
  methodsTextSnapshot: "",
  samplePlacementDescriptionSnapshot: "",
  reactionFlowDescriptionSnapshot: "",
  referencePaperUrlSnapshot: "",
  unpublishedReasonSnapshot: "",
  diagramFileAssetId: "",
  isSameAsTemplate: false,
  deviationNote: "",
  semanticContextText: "{}",
  confirmedAt: null,
  confirmedById: null,
};

afterEach(() => {
  cleanup();
});

test("renders setup methods required fields and confirm action", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  const onConfirm = vi.fn();
  const onApplyTemplate = vi.fn();

  renderWithApp(
    <SetupMethodsSection
      disabled={false}
      files={[]}
      onApplyTemplate={onApplyTemplate}
      onChange={onChange}
      onConfirm={onConfirm}
      templateOptions={[
        {
          template_key: "group_fast_cvd",
          template_version: 1,
          name: "组内快速 CVD",
          institution: "group",
          apparatus_description: "Tube furnace",
          methods_text: "Template methods",
          sample_placement_description: "Template placement",
          reaction_flow_description: "Template flow",
          reference_paper_url: null,
          unpublished_reason: "Internal",
          semantic_context: {},
          has_packaged_diagram: false,
        },
      ]}
      value={baseValue}
    />,
  );

  await user.type(screen.getByLabelText("Setup 名称"), "组内快速 CVD");
  expect(onChange).toHaveBeenCalled();
  await user.click(screen.getByLabelText("Setup 模板"));
  await user.click(await screen.findByTitle("组内快速 CVD v1"));
  await user.click(screen.getByRole("button", { name: "套用模板" }));
  expect(onApplyTemplate).toHaveBeenCalledWith("group_fast_cvd", 1);
  expect(screen.getByRole("button", { name: "套用模板" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "确认 Setup" })).toBeInTheDocument();
});

test("treats setup methods without a confirmer as unconfirmed", () => {
  renderWithApp(
    <SetupMethodsSection
      disabled={false}
      files={[]}
      onApplyTemplate={vi.fn()}
      onChange={vi.fn()}
      onConfirm={vi.fn()}
      templateOptions={[]}
      value={{
        ...baseValue,
        confirmedAt: "2026-06-05T00:00:00Z",
        confirmedById: null,
      }}
    />,
  );

  expect(screen.getByText("未确认")).toBeInTheDocument();
  expect(screen.queryByText("已确认")).not.toBeInTheDocument();
});
