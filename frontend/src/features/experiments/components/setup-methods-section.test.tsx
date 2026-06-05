import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, test, vi, expect } from "vitest";

import { renderWithApp } from "../../../test/render";
import { SetupMethodsSection } from "./setup-methods-section";
import type { SetupLibraryRead } from "../../../shared/types/api";

// Mock useAuth
vi.mock("../../auth/use-auth", () => ({
  useAuth: () => ({
    session: {
      accessToken: "test-token",
      currentUser: { id: "user-1", name: "Test User" },
    },
  }),
}));

// Mock AuthenticatedImage
vi.mock("../../../shared/ui/authenticated-image", () => ({
  AuthenticatedImage: ({ alt }: { alt: string }) => <img alt={alt} data-testid="auth-img" />,
}));

// Mock api
vi.mock("../api", () => ({
  downloadExperimentFile: vi.fn(),
}));

const mockLibraryOptions: SetupLibraryRead[] = [
  {
    id: "lib-1",
    owner_id: "user-1",
    owner_name: "Test User",
    visibility: "private",
    is_active: true,
    name: "测试 Setup",
    institution: "测试机构",
    apparatus_description: "测试设备说明",
    methods_text: "测试实验方法步骤",
    sample_placement_description: "测试样品放置",
    reaction_flow_description: "测试气流",
    reference_paper_url: "https://doi.org/10.1000/xyz123",
    unpublished_reason: null,
    has_diagram: false,
    diagram_original_name: null,
    diagram_download_url: null,
    content_hash: "hash1",
    can_edit: true,
    semantic_context: {},
    created_at: "2026-06-05T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
  },
];

const baseValue = {
  sourceTemplateKey: null,
  sourceTemplateVersion: null,
  sourceSetupLibraryId: null,
  setupKeySnapshot: null,
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

test("renders setup library selection dropdown and handles applying it", async () => {
  const user = userEvent.setup();
  const onApplyLibrary = vi.fn();
  const onChange = vi.fn();

  renderWithApp(
    <SetupMethodsSection
      disabled={false}
      files={[]}
      onApplyLibrary={onApplyLibrary}
      onChange={onChange}
      libraryOptions={mockLibraryOptions}
      value={baseValue}
    />,
  );

  expect(screen.getByText("选择 Setup 库记录")).toBeInTheDocument();
  
  // Click on the select input to open the dropdown list
  const selectInput = screen.getByLabelText("选择 Setup");
  await user.click(selectInput);
  
  // Find and click the option in the dropdown list
  const option = await screen.findByText("测试 Setup (测试机构)");
  await user.click(option);

  // Click the apply button
  const applyButton = screen.getByRole("button", { name: "套用 Setup" });
  await user.click(applyButton);

  expect(onApplyLibrary).toHaveBeenCalledWith("lib-1");
});

test("renders snapshot preview card when snapshot details are present", () => {
  renderWithApp(
    <SetupMethodsSection
      disabled={false}
      files={[]}
      onApplyLibrary={vi.fn()}
      onChange={vi.fn()}
      libraryOptions={mockLibraryOptions}
      value={{
        ...baseValue,
        setupNameSnapshot: "快照 Setup 名称",
        institutionSnapshot: "快照机构",
        methodsTextSnapshot: "快照方法文本",
        apparatusDescriptionSnapshot: "快照设备描述",
      }}
    />,
  );

  expect(screen.getByText("快照 Setup 名称")).toBeInTheDocument();
  expect(screen.getByText("快照机构")).toBeInTheDocument();
  expect(screen.getByText("快照方法文本")).toBeInTheDocument();
  expect(screen.getByText("快照设备描述")).toBeInTheDocument();
});

test("renders deviation checkbox and inputs when sourceSetupLibraryId is applied", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();

  renderWithApp(
    <SetupMethodsSection
      disabled={false}
      files={[]}
      onApplyLibrary={vi.fn()}
      onChange={onChange}
      libraryOptions={mockLibraryOptions}
      value={{
        ...baseValue,
        sourceSetupLibraryId: "lib-1",
        isSameAsTemplate: false,
        deviationNote: "偏差说明内容",
      }}
    />,
  );

  const checkbox = screen.getByRole("checkbox", { name: "与该 Setup 一致" });
  expect(checkbox).not.toBeChecked();

  const deviationInput = screen.getByLabelText("偏差说明");
  expect(deviationInput).toHaveValue("偏差说明内容");

  await user.type(deviationInput, "新偏差");
  expect(onChange).toHaveBeenCalled();
});
