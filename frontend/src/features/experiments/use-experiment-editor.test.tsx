import type { PropsWithChildren } from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExperimentRead } from "../../shared/types/api";
import type { ExperimentEditorValues } from "./editor-types";
import { validateExperiment } from "./api";
import { useExperimentEditor } from "./use-experiment-editor";

vi.mock("./api", () => ({
  listExperimentModules: vi.fn(),
  submitExperiment: vi.fn(),
  updateExperiment: vi.fn(),
  upsertExperimentModule: vi.fn(),
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

describe("useExperimentEditor completion", () => {
  afterEach(() => {
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
      percent: 10,
    });
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
