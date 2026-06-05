import type { PropsWithChildren } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExperimentRead, SetupMethodsRead } from "../../shared/types/api";
import type { ExperimentEditorValues } from "./editor-types";
import {
  createSetupMethodsFromLibrary,
  upsertSetupMethods,
  validateExperiment,
} from "./api";
import { useExperimentEditor } from "./use-experiment-editor";

vi.mock("./api", () => ({
  createSetupMethodsFromLibrary: vi.fn(),
  listExperimentModules: vi.fn(),
  submitExperiment: vi.fn(),
  updateExperiment: vi.fn(),
  upsertExperimentModule: vi.fn(),
  upsertSetupMethods: vi.fn(),
  validateExperiment: vi.fn(),
}));

const experiment: ExperimentRead = {
  id: "exp-1",
  run_code: "CVD-2026-0001",
  owner_id: "user-1",
  derived_from_run_id: null,
  derived_from_run_code: null,
  recipe_id: null,
  experiment_type: "growth",
  material_system: null,
  experiment_date: "",
  objective: null,
  status: "draft",
  quality_label: "unknown",
  summary_result: null,
  invalid_reason: null,
  created_at: "2026-04-28T00:00:00Z",
  updated_at: "2026-04-28T00:00:00Z",
  submitted_at: null,
  locked_at: null,
};

const valuesWithEnabledCharacterizationOnly: ExperimentEditorValues = {
  basicInfo: {
    experimentType: "",
    materialSystem: "",
    experimentDate: "",
    layerCount: "",
    objective: "",
  },
  setupMethods: {
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
  },
  environment: {
    indoorTemperatureC: "",
    indoorHumidityPercent: "",
    sampleEnv: "",
    abnormalNote: "",
  },
  precheck: {
    sealIntact: "",
    riskNote: "",
    hoodClean: "",
    flangeBlocked: "",
    boatContaminationLevel: "",
    tubeContaminationLevel: "",
  },
  precursors: {
    items: [],
  },
  substrates: {
    items: [],
  },
  furnaceProgram: {
    furnaceInfo: {
      zonesCount: "2",
      model: "",
    },
    placements: [],
    zones: [],
  },
  gasProgram: {
    preWashingGas: "",
    segments: [],
  },
  processObservation: {
    colorChange: "",
    abnormalEvents: [],
    note: "",
  },
  characterization: {
    methods: [
      {
        method: "",
        result: "",
        enabled: true,
        excitationNm: "",
        note: "",
      },
    ],
  },
  resultSummary: {
    summaryResult: "",
    qualityLabel: "unknown",
    nextStep: "",
  },
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createSetupMethodsRead(overrides: Partial<SetupMethodsRead> = {}): SetupMethodsRead {
  return {
    id: "setup-1",
    experiment_run_id: experiment.id,
    source_template_key: null,
    source_template_version: null,
    source_setup_library_id: null,
    setup_key_snapshot: "manual:abcdef1234567890",
    setup_name_snapshot: "Manual setup",
    setup_version_snapshot: 1,
    institution_snapshot: null,
    apparatus_description_snapshot: "",
    methods_text_snapshot: "",
    sample_placement_description_snapshot: "",
    reaction_flow_description_snapshot: "",
    reference_paper_url_snapshot: null,
    unpublished_reason_snapshot: null,
    diagram_file_asset_id: null,
    is_same_as_template: false,
    deviation_note: null,
    confirmed_by_id: null,
    confirmed_at: null,
    snapshot_hash: "a".repeat(64),
    semantic_context: {},
    created_at: "2026-06-05T00:00:00Z",
    updated_at: "2026-06-05T00:00:00Z",
    ...overrides,
  };
}

describe("useExperimentEditor completion", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.clearAllMocks();
  });

  it("treats an enabled characterization row in current editor values as complete", () => {
    const { result } = renderHook(
      () =>
        useExperimentEditor({
          accessToken: "token",
          currentUserId: "user-1",
          experimentId: experiment.id,
          initialExperiment: experiment,
          initialModulePayloads: {},
          initialValues: valuesWithEnabledCharacterizationOnly,
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.moduleCompletionMap.characterization).toEqual({
      state: "complete",
      percent: 100,
    });
    expect(result.current.completionSummary).toMatchObject({
      completedCount: 1,
      percent: 12,
    });
  });

  it("warns before leaving while dirty changes wait for autosave", () => {
    const { result } = renderHook(
      () =>
        useExperimentEditor({
          accessToken: "token",
          currentUserId: "user-1",
          experimentId: experiment.id,
          initialExperiment: experiment,
          initialModulePayloads: {},
          initialValues: valuesWithEnabledCharacterizationOnly,
        }),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.updateValues((current) => ({
        ...current,
        basicInfo: {
          ...current.basicInfo,
          objective: "Changed objective",
        },
      }));
    });

    expect(result.current.shouldWarnOnLeave).toBe(true);
    expect(result.current.leaveWarning).toBe("仍有未保存修改，确认离开当前编辑页吗？");
  });

  it("keeps setup autosave warning details in the section message", async () => {
    const savedSetupMethods = createSetupMethodsRead({
      source_template_key: "group_fast_cvd",
      source_template_version: 1,
      setup_key_snapshot: "group_fast_cvd:v1",
      setup_name_snapshot: "Manual setup",
      is_same_as_template: true,
    });
    vi.mocked(upsertSetupMethods).mockResolvedValue({
      data: savedSetupMethods,
      warnings: [
        {
          module_key: "setup_methods",
          field_path: "diagram_file_asset_id",
          message: "模板 Setup 图未能自动附加，请手动上传",
        },
      ],
    });
    vi.useFakeTimers();
    const { result } = renderHook(
      () =>
        useExperimentEditor({
          accessToken: "token",
          currentUserId: "user-1",
          experimentId: experiment.id,
          initialExperiment: experiment,
          initialModulePayloads: {},
          initialValues: valuesWithEnabledCharacterizationOnly,
        }),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.updateValues((current) => ({
        ...current,
        setupMethods: {
          ...current.setupMethods,
          setupNameSnapshot: "Manual setup",
        },
      }));
    });
    act(() => {
      result.current.scheduleAutosave();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
      await Promise.resolve();
    });

    expect(result.current.sectionStates.setup_methods.status).toBe("saved");
    expect(result.current.sectionStates.setup_methods.message).toContain(
      "模板 Setup 图未能自动附加，请手动上传",
    );
  });

  it("keeps in-flight setup autosave responses from overwriting newer edits", async () => {
    let resolveUpsert: (value: Awaited<ReturnType<typeof upsertSetupMethods>>) => void = () => {};
    vi.mocked(upsertSetupMethods).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpsert = resolve;
        }),
    );
    vi.useFakeTimers();
    const { result } = renderHook(
      () =>
        useExperimentEditor({
          accessToken: "token",
          currentUserId: "user-1",
          experimentId: experiment.id,
          initialExperiment: experiment,
          initialModulePayloads: {},
          initialValues: valuesWithEnabledCharacterizationOnly,
        }),
      { wrapper: createWrapper() },
    );

    act(() => {
      result.current.updateValues((current) => ({
        ...current,
        setupMethods: {
          ...current.setupMethods,
          setupNameSnapshot: "First setup name",
        },
      }));
      result.current.scheduleAutosave();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(upsertSetupMethods).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.updateValues((current) => ({
        ...current,
        setupMethods: {
          ...current.setupMethods,
          setupNameSnapshot: "Second setup name",
        },
      }));
    });

    await act(async () => {
      resolveUpsert({
        data: createSetupMethodsRead({ setup_name_snapshot: "First setup name" }),
        warnings: [],
      });
      await Promise.resolve();
    });

    expect(result.current.values.setupMethods.setupNameSnapshot).toBe("Second setup name");
    expect(result.current.shouldWarnOnLeave).toBe(true);
  });

  it("keeps in-flight setup library responses from overwriting newer edits", async () => {
    let resolveLibrary: (
      value: Awaited<ReturnType<typeof createSetupMethodsFromLibrary>>,
    ) => void = () => {};
    vi.mocked(createSetupMethodsFromLibrary).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLibrary = resolve;
        }),
    );
    const { result } = renderHook(
      () =>
        useExperimentEditor({
          accessToken: "token",
          currentUserId: "user-1",
          experimentId: experiment.id,
          initialExperiment: experiment,
          initialModulePayloads: {},
          initialValues: valuesWithEnabledCharacterizationOnly,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      void result.current.applySetupLibrary("library-id-123");
      await Promise.resolve();
    });
    expect(createSetupMethodsFromLibrary).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.updateValues((current) => ({
        ...current,
        setupMethods: {
          ...current.setupMethods,
          setupNameSnapshot: "Edited while applying library",
        },
      }));
    });

    await act(async () => {
      resolveLibrary({
        data: createSetupMethodsRead({
          source_setup_library_id: "library-id-123",
          setup_name_snapshot: "Library setup",
        }),
        warnings: [],
      });
      await Promise.resolve();
    });

    expect(result.current.values.setupMethods.setupNameSnapshot).toBe(
      "Edited while applying library",
    );
    expect(result.current.shouldWarnOnLeave).toBe(true);
  });

  it("uses backend validation counts for non-editor module summary issues", async () => {
    vi.mocked(validateExperiment).mockResolvedValue({
      ok: false,
      completion_score: 63,
      blocking_count: 2,
      warning_count: 4,
      errors: [
        {
          module_key: "files",
          field_path: "uploads",
          message: "缺少表征文件",
        },
      ],
      warnings: [
        {
          module_key: "files",
          field_path: "uploads",
          message: "建议补充原始文件",
        },
      ],
    });

    const { result } = renderHook(
      () =>
        useExperimentEditor({
          accessToken: "token",
          currentUserId: "user-1",
          experimentId: experiment.id,
          initialExperiment: experiment,
          initialModulePayloads: {},
          initialValues: valuesWithEnabledCharacterizationOnly,
        }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.submitDraft();
    });

    expect(result.current.completionSummary).toMatchObject({
      blockingCount: 2,
      percent: 63,
      warningCount: 4,
    });
  });
});
