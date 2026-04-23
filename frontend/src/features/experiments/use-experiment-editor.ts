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
  editorSectionKeys,
  serializeSectionValues,
  toBasicInfoPayload,
  toExperimentPatch,
  toFurnaceProgramPayload,
  toGasProgramPayload,
  toPrecursorsPayload,
  toPrecheckPayload,
  toSubstratesPayload,
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

function createIdleSectionStates(): Record<EditorSectionKey, SectionSaveState> {
  return {
    basic_info: { status: "idle", message: null },
    precheck: { status: "idle", message: null },
    precursors: { status: "idle", message: null },
    substrates: { status: "idle", message: null },
    furnace_program: { status: "idle", message: null },
    gas_program: { status: "idle", message: null },
  };
}

export function useExperimentEditor({
  experimentId,
  accessToken,
  currentUserId,
  initialExperiment,
  initialValues,
}: {
  experimentId: string;
  accessToken: string;
  currentUserId: string;
  initialExperiment: ExperimentRead;
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
        precheck: "",
        precursors: "",
        substrates: "",
        furnace_program: "",
        gas_program: "",
      },
    ),
  );
  const valuesRef = useRef(initialValues);
  const sectionStatesRef = useRef(createIdleSectionStates());

  const [experiment, setExperiment] = useState(initialExperiment);
  const [values, setValues] = useState(initialValues);
  const [sectionStates, setSectionStates] = useState<Record<EditorSectionKey, SectionSaveState>>(
    createIdleSectionStates,
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
    const nextSectionStates = createIdleSectionStates();
    sectionStatesRef.current = nextSectionStates;
    setSectionStates(nextSectionStates);
  }, []);

  const updateValues = useCallback(
    (updater: (current: ExperimentEditorValues) => ExperimentEditorValues) => {
      setValues((current) => {
        const nextValues = updater(current);
        valuesRef.current = nextValues;
        return nextValues;
      });
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

      let nextExperiment: ExperimentRead | null = experiment;
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
            savedModule = await upsertExperimentModule(accessToken, experimentId, "basic_info", {
              payload_json: toBasicInfoPayload(draftValues.basicInfo, currentUserId),
            });
            nextExperiment = patchedExperiment;
            setExperiment(patchedExperiment);
          } else if (sectionKey === "precheck") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "precheck", {
              payload_json: toPrecheckPayload(draftValues.precheck),
            });
          } else if (sectionKey === "precursors") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "precursors", {
              payload_json: toPrecursorsPayload(draftValues.precursors),
            });
          } else if (sectionKey === "substrates") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "substrates", {
              payload_json: toSubstratesPayload(draftValues.substrates),
            });
          } else if (sectionKey === "furnace_program") {
            savedModule = await upsertExperimentModule(
              accessToken,
              experimentId,
              "furnace_program",
              {
                payload_json: toFurnaceProgramPayload(draftValues.furnaceProgram),
              },
            );
          } else if (sectionKey === "gas_program") {
            savedModule = await upsertExperimentModule(accessToken, experimentId, "gas_program", {
              payload_json: toGasProgramPayload(draftValues.gasProgram),
            });
          }

          if (savedModule) {
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
      experiment,
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
