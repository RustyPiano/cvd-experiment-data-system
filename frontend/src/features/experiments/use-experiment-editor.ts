import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { HttpError } from "../../shared/api/http-error";
import type {
  ExperimentModulePayloadListResponse,
  ExperimentModulePayloadRead,
  ExperimentRead,
  ExperimentValidationResponse,
} from "../../shared/types/api";
import {
  listExperimentModules,
  submitExperiment,
  updateExperiment,
  upsertExperimentModule,
  validateExperiment,
} from "./api";
import {
  createInitialEditorValues,
  createInitialSectionStates,
  editorSectionKeys,
  mergeBasicInfoPayload,
  mergeCharacterizationPayload,
  mergeEnvironmentPayload,
  mergeFurnaceProgramPayload,
  mergeGasProgramPayload,
  mergePrecursorsPayload,
  mergePrecheckPayload,
  mergeProcessObservationPayload,
  mergeResultSummaryPayload,
  mergeSubstratesPayload,
  serializeSectionValues,
  toBasicInfoPayload,
  toEnvironmentPayload,
  toExperimentPatch,
  toFurnaceProgramPayload,
  toGasProgramPayload,
  toPrecheckPayload,
  toPrecursorsPayload,
  toProcessObservationPayload,
  toResultSummaryPayload,
  toSubstratesPayload,
  type ModulePayloadMap,
  toResultSummaryPatch,
  validateSectionValues,
  type EditorSectionKey,
  type EditorValidationError,
  type ExperimentEditorValues,
  type SectionSaveState,
} from "./editor-types";
import {
  computeModuleCompletion,
  type CompletionSummary,
  type CompletionValidationIssue,
  type ModuleCompletionStatus,
} from "./components/completion-indicator";

type SubmitState = {
  status: "idle" | "submitting" | "error";
  message: string | null;
};

type InheritedSectionKey = "environment" | "precheck";

type InheritedFromState = Partial<Record<InheritedSectionKey, string>>;

type InheritanceStoragePayload = {
  sourceExperimentId?: string;
  sourceRunCode?: string | null;
  environment?: Record<string, unknown> | null;
  precheck?: Record<string, unknown> | null;
};

const inheritanceStoragePrefix = "experiment:inherit:";

function inheritanceStorageKey(sourceExperimentId: string) {
  return `${inheritanceStoragePrefix}${sourceExperimentId}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readInheritancePayload(sourceExperimentId: string): InheritanceStoragePayload | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawPayload = window.sessionStorage.getItem(inheritanceStorageKey(sourceExperimentId));
  if (!rawPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawPayload) as InheritanceStoragePayload;
    return {
      sourceExperimentId: parsed.sourceExperimentId,
      sourceRunCode: parsed.sourceRunCode,
      environment: asRecord(parsed.environment),
      precheck: asRecord(parsed.precheck),
    };
  } catch {
    return null;
  }
}

function removeInheritancePayload(sourceExperimentId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(inheritanceStorageKey(sourceExperimentId));
}

function createInheritedModulePayload(
  experimentId: string,
  moduleKey: InheritedSectionKey,
  payloadJson: Record<string, unknown>,
): ExperimentModulePayloadRead {
  return {
    id: `inherit-${moduleKey}`,
    experiment_run_id: experimentId,
    module_key: moduleKey,
    schema_version: "cvd_v1",
    payload_json: payloadJson,
    note: null,
    created_at: "",
    updated_at: "",
  };
}

function buildInheritedValues({
  environment,
  experiment,
  precheck,
}: {
  environment?: Record<string, unknown> | null;
  experiment: ExperimentRead;
  precheck?: Record<string, unknown> | null;
}) {
  const modulePayloads: ExperimentModulePayloadRead[] = [];
  if (environment) {
    modulePayloads.push(createInheritedModulePayload(experiment.id, "environment", environment));
  }
  if (precheck) {
    modulePayloads.push(createInheritedModulePayload(experiment.id, "precheck", precheck));
  }

  if (!modulePayloads.length) {
    return null;
  }

  const values = createInitialEditorValues(experiment, modulePayloads);
  const inheritedPrecheck = precheck
    ? {
        ...values.precheck,
        sealIntact: "" as const,
        riskNote: "",
        hoodClean: "" as const,
        flangeBlocked: "" as const,
        boatContaminationLevel: "" as const,
        tubeContaminationLevel: "" as const,
      }
    : null;

  return {
    environment: environment
      ? {
          ...values.environment,
          abnormalNote: "",
        }
      : null,
    precheck: inheritedPrecheck,
  };
}

function isInheritedSectionKey(sectionKey: EditorSectionKey): sectionKey is InheritedSectionKey {
  return sectionKey === "environment" || sectionKey === "precheck";
}

function isValidationResponse(payload: unknown): payload is ExperimentValidationResponse {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  return (
    "ok" in payload &&
    "errors" in payload &&
    "warnings" in payload &&
    Array.isArray((payload as ExperimentValidationResponse).errors) &&
    Array.isArray((payload as ExperimentValidationResponse).warnings)
  );
}

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return error.detail || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function groupValidationErrorsBySection(errors: EditorValidationError[]) {
  return errors.reduce<Map<EditorSectionKey, EditorValidationError[]>>((result, error) => {
    const current = result.get(error.sectionKey) ?? [];
    result.set(error.sectionKey, [...current, error]);
    return result;
  }, new Map());
}

function shouldShowValidationResult(validation: ExperimentValidationResponse) {
  return (
    validation.errors.length > 0 ||
    validation.warnings.length > 0 ||
    (typeof validation.completion_score === "number" && validation.completion_score < 100)
  );
}

function toCharacterizationCompletionPayload(values: ExperimentEditorValues["characterization"]) {
  return {
    methods: values.methods.map((method) => ({
      enabled: method.enabled,
    })),
  };
}

export function useExperimentEditor({
  experimentId,
  accessToken,
  currentUserId,
  inheritFrom,
  initialExperiment,
  initialModulePayloads,
  initialValues,
  onInheritanceConsumed,
}: {
  experimentId: string;
  accessToken: string;
  currentUserId: string;
  inheritFrom?: string | null;
  initialExperiment: ExperimentRead;
  initialModulePayloads: ModulePayloadMap;
  initialValues: ExperimentEditorValues;
  onInheritanceConsumed?: () => void;
}) {
  const queryClient = useQueryClient();
  const autosaveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef(Promise.resolve<unknown>(undefined));
  const snapshotsRef = useRef<Record<EditorSectionKey, string>>(
    editorSectionKeys.reduce<Record<EditorSectionKey, string>>(
      (result, sectionKey) => {
        result[sectionKey] = serializeSectionValues(sectionKey, initialValues);
        return result;
      },
      {
        basic_info: "",
        environment: "",
        precheck: "",
        precursors: "",
        substrates: "",
        furnace_program: "",
        gas_program: "",
        process_observation: "",
        characterization: "",
        result_summary: "",
      },
    ),
  );
  const valuesRef = useRef(initialValues);
  const modulePayloadsRef = useRef<ModulePayloadMap>(initialModulePayloads);
  const sectionStatesRef = useRef(createInitialSectionStates());
  const inheritanceAppliedRef = useRef(false);
  const inheritedSourceIdRef = useRef<string | null>(null);
  const pendingInheritedSectionsRef = useRef<Set<InheritedSectionKey>>(new Set());
  const inheritanceCleanupTimerRef = useRef<number | null>(null);

  const [experiment, setExperiment] = useState(initialExperiment);
  const [values, setValues] = useState(initialValues);
  const [sectionStates, setSectionStates] = useState<Record<EditorSectionKey, SectionSaveState>>(
    createInitialSectionStates,
  );
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: null,
  });
  const [validationResult, setValidationResult] = useState<ExperimentValidationResponse | null>(
    null,
  );
  const [hasDirtyChanges, setHasDirtyChanges] = useState(false);
  const [inheritedFrom, setInheritedFrom] = useState<InheritedFromState>({});
  const [inheritanceError, setInheritanceError] = useState<string | null>(null);

  const setSectionState = useCallback(
    (sectionKey: EditorSectionKey, nextState: SectionSaveState) => {
      setSectionStates((current) => {
        const nextSectionStates = {
          ...current,
          [sectionKey]: nextState,
        };
        sectionStatesRef.current = nextSectionStates;
        return nextSectionStates;
      });
    },
    [],
  );

  const resetSectionStates = useCallback(() => {
    const nextSectionStates = createInitialSectionStates();
    sectionStatesRef.current = nextSectionStates;
    setSectionStates(nextSectionStates);
  }, []);

  const getDirtySections = useCallback((draftValues: ExperimentEditorValues) => {
    return editorSectionKeys.filter(
      (sectionKey) =>
        serializeSectionValues(sectionKey, draftValues) !== snapshotsRef.current[sectionKey],
    );
  }, []);

  const updateValues = useCallback(
    (updater: (current: ExperimentEditorValues) => ExperimentEditorValues) => {
      const nextValues = updater(valuesRef.current);
      valuesRef.current = nextValues;
      setValues(nextValues);
      setHasDirtyChanges(getDirtySections(nextValues).length > 0);
      setValidationResult(null);
    },
    [getDirtySections],
  );

  const enqueueSave = useCallback(<T,>(task: () => Promise<T>) => {
    const nextTask = saveQueueRef.current.then(task, task);
    saveQueueRef.current = nextTask.catch(() => undefined);
    return nextTask;
  }, []);

  const consumeInheritanceIfComplete = useCallback(() => {
    const inheritedSourceId = inheritedSourceIdRef.current ?? inheritFrom ?? null;
    if (!inheritedSourceId || pendingInheritedSectionsRef.current.size > 0) {
      return;
    }

    if (inheritanceCleanupTimerRef.current) {
      window.clearTimeout(inheritanceCleanupTimerRef.current);
    }

    inheritanceCleanupTimerRef.current = window.setTimeout(() => {
      inheritanceCleanupTimerRef.current = null;
      if (
        pendingInheritedSectionsRef.current.size > 0 ||
        inheritedSourceIdRef.current !== inheritedSourceId
      ) {
        return;
      }

      removeInheritancePayload(inheritedSourceId);
      inheritedSourceIdRef.current = null;
      onInheritanceConsumed?.();
    }, 0);
  }, [inheritFrom, onInheritanceConsumed]);

  const markInheritedSectionSaved = useCallback(
    (sectionKey: EditorSectionKey) => {
      if (
        !isInheritedSectionKey(sectionKey) ||
        !pendingInheritedSectionsRef.current.has(sectionKey)
      ) {
        return;
      }

      pendingInheritedSectionsRef.current.delete(sectionKey);
      consumeInheritanceIfComplete();
    },
    [consumeInheritanceIfComplete],
  );

  const patchModulesCache = useCallback(
    (savedModule: ExperimentModulePayloadRead) => {
      queryClient.setQueryData<ExperimentModulePayloadListResponse>(
        ["experiments", "modules", currentUserId, experimentId],
        (current) => {
          const currentItems = current?.items ?? [];
          const nextItems = currentItems.some((item) => item.module_key === savedModule.module_key)
            ? currentItems.map((item) =>
                item.module_key === savedModule.module_key ? savedModule : item,
              )
            : [...currentItems, savedModule];

          return {
            items: nextItems,
            total: nextItems.length,
          };
        },
      );
    },
    [currentUserId, experimentId, queryClient],
  );

  const persistDirtySections = useCallback(
    async (
      draftValues: ExperimentEditorValues,
      forceSaveSections: EditorSectionKey[] = [],
    ) => {
      const sectionKeysToSave = new Set<EditorSectionKey>([
        ...getDirtySections(draftValues),
        ...forceSaveSections,
      ]);
      const dirtySections = editorSectionKeys.filter((sectionKey) =>
        sectionKeysToSave.has(sectionKey),
      );

      if (!dirtySections.length) {
        return false;
      }

      let nextExperiment: ExperimentRead | null = null;
      let hasError = false;
      const validationErrors = dirtySections.flatMap((sectionKey) =>
        validateSectionValues(sectionKey, draftValues),
      );
      const validationErrorsBySection = groupValidationErrorsBySection(validationErrors);
      const savableSections = dirtySections.filter(
        (sectionKey) => !validationErrorsBySection.has(sectionKey),
      );

      for (const [sectionKey, errors] of validationErrorsBySection) {
        hasError = true;
        setSectionState(sectionKey, {
          status: "error",
          message: errors.map((error) => error.message).join("；"),
        });
      }

      for (const sectionKey of savableSections) {
        setSectionState(sectionKey, {
          status: "saving",
          message: "自动保存中",
        });
      }

      for (const sectionKey of savableSections) {
        let savedModule: ExperimentModulePayloadRead | null = null;

        try {
          if (sectionKey === "basic_info") {
            const patchedExperiment = await updateExperiment(
              accessToken,
              experimentId,
              toExperimentPatch(draftValues.basicInfo),
            );
            nextExperiment = patchedExperiment;
            setExperiment(patchedExperiment);
            savedModule = await upsertExperimentModule(accessToken, experimentId, "basic_info", {
              payload_json: mergeBasicInfoPayload(
                modulePayloadsRef.current.basic_info,
                draftValues.basicInfo,
                currentUserId,
              ),
            });
          } else if (sectionKey === "environment") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "environment", {
              payload_json: mergeEnvironmentPayload(
                modulePayloadsRef.current.environment,
                draftValues.environment,
              ),
            });
          } else if (sectionKey === "precheck") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "precheck", {
              payload_json: mergePrecheckPayload(
                modulePayloadsRef.current.precheck,
                draftValues.precheck,
              ),
            });
          } else if (sectionKey === "precursors") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "precursors", {
              payload_json: mergePrecursorsPayload(
                modulePayloadsRef.current.precursors,
                draftValues.precursors,
              ),
            });
          } else if (sectionKey === "substrates") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "substrates", {
              payload_json: mergeSubstratesPayload(
                modulePayloadsRef.current.substrates,
                draftValues.substrates,
              ),
            });
          } else if (sectionKey === "furnace_program") {
            savedModule = await upsertExperimentModule(
              accessToken,
              experimentId,
              "furnace_program",
              {
                payload_json: mergeFurnaceProgramPayload(
                  modulePayloadsRef.current.furnace_program,
                  draftValues.furnaceProgram,
                ),
              },
            );
          } else if (sectionKey === "gas_program") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "gas_program", {
              payload_json: mergeGasProgramPayload(
                modulePayloadsRef.current.gas_program,
                draftValues.gasProgram,
              ),
            });
          } else if (sectionKey === "process_observation") {
            savedModule = await upsertExperimentModule(
              accessToken,
              experimentId,
              "process_observation",
              {
                payload_json: mergeProcessObservationPayload(
                  modulePayloadsRef.current.process_observation,
                  draftValues.processObservation,
                ),
              },
            );
          } else if (sectionKey === "characterization") {
            savedModule = await upsertExperimentModule(
              accessToken,
              experimentId,
              "characterization",
              {
                payload_json: mergeCharacterizationPayload(
                  modulePayloadsRef.current.characterization,
                  draftValues.characterization,
                ),
              },
            );
          } else if (sectionKey === "result_summary") {
            const patchedExperiment = await updateExperiment(
              accessToken,
              experimentId,
              toResultSummaryPatch(draftValues.resultSummary),
            );
            nextExperiment = {
              ...patchedExperiment,
              quality_label: draftValues.resultSummary.qualityLabel,
              summary_result: draftValues.resultSummary.summaryResult.trim() || null,
            };
            setExperiment(nextExperiment);
            savedModule = await upsertExperimentModule(
              accessToken,
              experimentId,
              "result_summary",
              {
                payload_json: mergeResultSummaryPayload(
                  modulePayloadsRef.current.result_summary,
                  draftValues.resultSummary,
                ),
              },
            );
          }

          if (savedModule) {
            modulePayloadsRef.current = {
              ...modulePayloadsRef.current,
              [sectionKey]: savedModule.payload_json,
            };
            patchModulesCache(savedModule);
          }
          snapshotsRef.current[sectionKey] = serializeSectionValues(sectionKey, draftValues);
          setSectionState(sectionKey, {
            status: "saved",
            message: "已自动保存",
          });
          markInheritedSectionSaved(sectionKey);
        } catch (error) {
          hasError = true;
          setSectionState(sectionKey, {
            status: "error",
            message: resolveErrorMessage(error, "自动保存失败"),
          });
        }
      }

      if (nextExperiment) {
        queryClient.setQueryData(
          ["experiments", "detail", currentUserId, experimentId],
          nextExperiment,
        );
        queryClient.setQueryData(
          ["experiments", "editor", currentUserId, experimentId],
          nextExperiment,
        );
      }
      if (savableSections.includes("result_summary")) {
        void queryClient.invalidateQueries({
          queryKey: ["experiments", "list", currentUserId],
        });
      }

      setHasDirtyChanges(getDirtySections(valuesRef.current).length > 0);

      return hasError;
    },
    [
      accessToken,
      currentUserId,
      experimentId,
      getDirtySections,
      patchModulesCache,
      queryClient,
      markInheritedSectionSaved,
      setSectionState,
    ],
  );

  const scheduleAutosave = useCallback(() => {
    if (experiment.status !== "draft") {
      return;
    }

    const dirtySections = getDirtySections(valuesRef.current);

    if (!dirtySections.length) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void enqueueSave(() => persistDirtySections(valuesRef.current));
    }, 900);
  }, [enqueueSave, experiment.status, getDirtySections, persistDirtySections]);

  const clearInheritedSection = useCallback((sectionKey: InheritedSectionKey) => {
    setInheritedFrom((current) => {
      if (!current[sectionKey]) {
        return current;
      }

      const next = { ...current };
      delete next[sectionKey];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!inheritFrom || inheritanceAppliedRef.current || experiment.status !== "draft") {
      return;
    }

    inheritanceAppliedRef.current = true;

    const applyInheritance = async () => {
      try {
        setInheritanceError(null);
        const storedPayload = readInheritancePayload(inheritFrom);
        const sourceRunCode = storedPayload?.sourceRunCode || inheritFrom;
        let environment = storedPayload?.environment ?? null;
        let precheck = storedPayload?.precheck ?? null;

        if (!environment && !precheck) {
          const sourceModules = await listExperimentModules(accessToken, inheritFrom);
          const sourcePayloads = Object.fromEntries(
            sourceModules.items.map((module) => [module.module_key, module.payload_json]),
          );
          environment = asRecord(sourcePayloads.environment);
          precheck = asRecord(sourcePayloads.precheck);
        }

        const inheritedValues = buildInheritedValues({
          environment,
          experiment: initialExperiment,
          precheck,
        });

        if (!inheritedValues) {
          removeInheritancePayload(inheritFrom);
          onInheritanceConsumed?.();
          return;
        }

        const nextValues: ExperimentEditorValues = {
          ...valuesRef.current,
          environment: inheritedValues.environment ?? valuesRef.current.environment,
          precheck: inheritedValues.precheck ?? valuesRef.current.precheck,
        };
        const forceSaveSections: EditorSectionKey[] = [
          ...(inheritedValues.environment ? (["environment"] as const) : []),
          ...(inheritedValues.precheck ? (["precheck"] as const) : []),
        ];
        inheritedSourceIdRef.current = inheritFrom;
        pendingInheritedSectionsRef.current = new Set(
          forceSaveSections.filter(isInheritedSectionKey),
        );

        valuesRef.current = nextValues;
        setValues(nextValues);
        setHasDirtyChanges(getDirtySections(nextValues).length > 0);
        setValidationResult(null);
        setInheritedFrom({
          ...(inheritedValues.environment ? { environment: sourceRunCode } : {}),
          ...(inheritedValues.precheck ? { precheck: sourceRunCode } : {}),
        });

        const saveFailed = await enqueueSave(() =>
          persistDirtySections(nextValues, forceSaveSections),
        );
        if (saveFailed) {
          return;
        }
        consumeInheritanceIfComplete();
      } catch (error) {
        setInheritanceError(resolveErrorMessage(error, "继承参数加载失败"));
      }
    };

    void applyInheritance();
  }, [
    accessToken,
    consumeInheritanceIfComplete,
    enqueueSave,
    experiment.status,
    getDirtySections,
    inheritFrom,
    initialExperiment,
    onInheritanceConsumed,
    persistDirtySections,
  ]);

  const saveSummary = useMemo(() => {
    const summaryStates = Object.values(sectionStates);
    const errorCount = summaryStates.filter((state) => state.status === "error").length;
    if (errorCount > 0) {
      return `${errorCount} 个区块保存失败`;
    }

    if (summaryStates.some((state) => state.status === "saving")) {
      return "自动保存中";
    }

    if (summaryStates.some((state) => state.status === "saved")) {
      return "草稿已自动保存";
    }

    return "编辑后自动保存";
  }, [sectionStates]);

  const currentModulePayloads = useMemo<Record<EditorSectionKey, Record<string, unknown>>>(
    () => ({
      basic_info: toBasicInfoPayload(values.basicInfo, currentUserId),
      environment: toEnvironmentPayload(values.environment),
      precheck: toPrecheckPayload(values.precheck),
      precursors: toPrecursorsPayload(values.precursors),
      substrates: toSubstratesPayload(values.substrates),
      furnace_program: toFurnaceProgramPayload(values.furnaceProgram),
      gas_program: toGasProgramPayload(values.gasProgram),
      process_observation: toProcessObservationPayload(values.processObservation),
      characterization: toCharacterizationCompletionPayload(values.characterization),
      result_summary: toResultSummaryPayload(values.resultSummary),
    }),
    [currentUserId, values],
  );

  const completionValidationIssues = useMemo<CompletionValidationIssue[]>(() => {
    if (!validationResult) {
      return [];
    }

    return [
      ...validationResult.errors.map((issue) => ({ ...issue, severity: "error" as const })),
      ...validationResult.warnings.map((issue) => ({ ...issue, severity: "warning" as const })),
    ];
  }, [validationResult]);

  const moduleCompletionMap = useMemo<Record<EditorSectionKey, ModuleCompletionStatus>>(
    () =>
      editorSectionKeys.reduce<Record<EditorSectionKey, ModuleCompletionStatus>>(
        (result, sectionKey) => {
          result[sectionKey] = computeModuleCompletion(
            sectionKey,
            currentModulePayloads[sectionKey],
            completionValidationIssues,
          );
          return result;
        },
        {
          basic_info: { state: "empty", percent: 0 },
          environment: { state: "empty", percent: 0 },
          precheck: { state: "empty", percent: 0 },
          precursors: { state: "empty", percent: 0 },
          substrates: { state: "empty", percent: 0 },
          furnace_program: { state: "empty", percent: 0 },
          gas_program: { state: "empty", percent: 0 },
          process_observation: { state: "empty", percent: 0 },
          characterization: { state: "empty", percent: 0 },
          result_summary: { state: "empty", percent: 0 },
        },
      ),
    [completionValidationIssues, currentModulePayloads],
  );

  const completionSummary = useMemo<CompletionSummary>(() => {
    const statuses = editorSectionKeys.map((sectionKey) => moduleCompletionMap[sectionKey]);
    const totalCount = statuses.length;

    return {
      percent: Math.round(
        statuses.reduce((total, status) => total + status.percent, 0) / totalCount,
      ),
      completedCount: statuses.filter((status) => status.state === "complete").length,
      totalCount,
      blockingCount: statuses.reduce(
        (total, status) => total + (status.state === "error" ? status.errors : 0),
        0,
      ),
      warningCount: statuses.reduce(
        (total, status) => total + (status.state === "warning" ? status.warnings : 0),
        0,
      ),
    };
  }, [moduleCompletionMap]);

  const hasSavingSections = useMemo(
    () => Object.values(sectionStates).some((state) => state.status === "saving"),
    [sectionStates],
  );
  const hasSaveErrors = useMemo(
    () => Object.values(sectionStates).some((state) => state.status === "error"),
    [sectionStates],
  );
  const shouldWarnOnLeave =
    experiment.status === "draft" &&
    (hasSavingSections || (hasSaveErrors && hasDirtyChanges));
  const leaveWarning = hasSavingSections
    ? "仍有区块正在保存，确认离开当前编辑页吗？"
    : "仍有保存失败且未持久化的修改，确认离开当前编辑页吗？";

  useEffect(() => {
    return () => {
      if (inheritanceCleanupTimerRef.current) {
        window.clearTimeout(inheritanceCleanupTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!shouldWarnOnLeave) {
        return;
      }

      event.preventDefault();
      event.returnValue = leaveWarning;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [leaveWarning, shouldWarnOnLeave]);

  const submitDraft = useCallback(async () => {
    if (experiment.status !== "draft") {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setSubmitState({
      status: "submitting",
      message: null,
    });
    setValidationResult(null);

    try {
      const saveFailed = await enqueueSave(() => persistDirtySections(valuesRef.current));

      if (
        saveFailed ||
        Object.values(sectionStatesRef.current).some((state) => state.status === "error")
      ) {
        setSubmitState({
          status: "error",
          message: "请先修正保存失败的区块后再提交。",
        });
        return;
      }

      const validation = await validateExperiment(accessToken, experimentId);
      setValidationResult(shouldShowValidationResult(validation) ? validation : null);
      if (validation.errors.length > 0) {
        setSubmitState({
          status: "error",
          message: "请先处理校验错误后再提交。",
        });
        return;
      }
      if (getDirtySections(valuesRef.current).length > 0) {
        setSubmitState({
          status: "error",
          message: "检测到校验后仍有未保存修改，请等待自动保存后再提交。",
        });
        setHasDirtyChanges(true);
        return;
      }

      const submittedExperiment = await submitExperiment(accessToken, experimentId);
      setExperiment(submittedExperiment);
      queryClient.setQueryData(
        ["experiments", "detail", currentUserId, experimentId],
        submittedExperiment,
      );
      queryClient.setQueryData(
        ["experiments", "editor", currentUserId, experimentId],
        submittedExperiment,
      );
      await queryClient.invalidateQueries({
        queryKey: ["experiments", "list", currentUserId],
      });
      resetSectionStates();
      setHasDirtyChanges(false);
      setSubmitState({
        status: "idle",
        message: null,
      });
    } catch (error) {
      if (error instanceof HttpError && isValidationResponse(error.payload)) {
        setValidationResult(error.payload);
      }
      setSubmitState({
        status: "error",
        message: resolveErrorMessage(error, "提交实验失败"),
      });
    }
  }, [
    accessToken,
    currentUserId,
    experiment.status,
    experimentId,
    getDirtySections,
    enqueueSave,
    persistDirtySections,
    queryClient,
    resetSectionStates,
  ]);

  return {
    experiment,
    leaveWarning,
    isDraft: experiment.status === "draft",
    isSubmitting: submitState.status === "submitting",
    shouldWarnOnLeave,
    inheritanceError,
    completionSummary,
    saveSummary,
    scheduleAutosave,
    sectionStates,
    moduleCompletionMap,
    submitDraft,
    submitState,
    inheritedFrom,
    clearInheritedSection,
    updateValues,
    validationResult,
    values,
  };
}
