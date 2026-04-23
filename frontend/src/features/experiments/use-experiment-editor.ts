import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { HttpError } from "../../shared/api/http-error";
import type {
  ExperimentModulePayloadListResponse,
  ExperimentModulePayloadRead,
  ExperimentRead,
} from "../../shared/types/api";
import { submitExperiment, updateExperiment, upsertExperimentModule } from "./api";
import {
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
  toExperimentPatch,
  type ModulePayloadMap,
  toResultSummaryPatch,
  type EditorSectionKey,
  type ExperimentEditorValues,
  type SectionSaveState,
} from "./editor-types";

type SubmitState = {
  status: "idle" | "submitting" | "error";
  message: string | null;
};

function resolveErrorMessage(error: unknown, fallback: string) {
  if (error instanceof HttpError) {
    return error.detail || fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export function useExperimentEditor({
  experimentId,
  accessToken,
  currentUserId,
  initialExperiment,
  initialModulePayloads,
  initialValues,
}: {
  experimentId: string;
  accessToken: string;
  currentUserId: string;
  initialExperiment: ExperimentRead;
  initialModulePayloads: ModulePayloadMap;
  initialValues: ExperimentEditorValues;
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

  const [experiment, setExperiment] = useState(initialExperiment);
  const [values, setValues] = useState(initialValues);
  const [sectionStates, setSectionStates] = useState<Record<EditorSectionKey, SectionSaveState>>(
    createInitialSectionStates,
  );
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: "idle",
    message: null,
  });

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

  const updateValues = useCallback(
    (updater: (current: ExperimentEditorValues) => ExperimentEditorValues) => {
      const nextValues = updater(valuesRef.current);
      valuesRef.current = nextValues;
      setValues(nextValues);
    },
    [],
  );

  const enqueueSave = <T,>(task: () => Promise<T>) => {
    const nextTask = saveQueueRef.current.then(task, task);
    saveQueueRef.current = nextTask.catch(() => undefined);
    return nextTask;
  };

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
    async (draftValues: ExperimentEditorValues) => {
      const dirtySections = editorSectionKeys.filter(
        (sectionKey) =>
          serializeSectionValues(sectionKey, draftValues) !== snapshotsRef.current[sectionKey],
      );

      if (!dirtySections.length) {
        return false;
      }

      let nextExperiment: ExperimentRead | null = null;
      let hasError = false;

      for (const sectionKey of dirtySections) {
        setSectionState(sectionKey, {
          status: "saving",
          message: "自动保存中",
        });
      }

      for (const sectionKey of dirtySections) {
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
            nextExperiment = patchedExperiment;
            setExperiment(patchedExperiment);
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

      return hasError;
    },
    [
      accessToken,
      currentUserId,
      experimentId,
      patchModulesCache,
      queryClient,
      setSectionState,
    ],
  );

  const scheduleAutosave = useCallback(() => {
    if (experiment.status !== "draft") {
      return;
    }

    const dirtySections = editorSectionKeys.filter(
      (sectionKey) =>
        serializeSectionValues(sectionKey, valuesRef.current) !== snapshotsRef.current[sectionKey],
    );

    if (!dirtySections.length) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void enqueueSave(() => persistDirtySections(valuesRef.current));
    }, 900);
  }, [experiment.status, persistDirtySections]);

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
      setSubmitState({
        status: "idle",
        message: null,
      });
    } catch (error) {
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
    persistDirtySections,
    queryClient,
    resetSectionStates,
  ]);

  return {
    experiment,
    isDraft: experiment.status === "draft",
    saveSummary,
    scheduleAutosave,
    sectionStates,
    submitDraft,
    submitState,
    updateValues,
    values,
  };
}
