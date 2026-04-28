import { useContext, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, App, Button } from "antd";
import {
  UNSAFE_DataRouterContext as DataRouterContext,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { PageHeader } from "../../shared/ui/page-header";
import { LoadingState } from "../../shared/ui/loading-state";
import { RouteLeaveGuard } from "../../shared/ui/route-leave-guard";
import type { ControlledVocabularyRead } from "../../shared/types/api";
import { useAuth } from "../auth/use-auth";
import { listActiveRecipes } from "../recipes/api";
import { getExperiment, listActiveVocabularies, listExperimentModules } from "./api";
import { CharacterizationSection } from "./components/characterization-section";
import { EditorActionBar } from "./components/editor-action-bar";
import { EditorSectionCard } from "./components/editor-section-card";
import { EditorStepper, type StepperItem } from "./components/editor-stepper";
import { EnvironmentSection } from "./components/environment-section";
import { ExperimentMainFields } from "./components/experiment-main-fields";
import { ExperimentDiffModal } from "./components/experiment-diff-modal";
import { ExperimentSourceBanner } from "./components/experiment-source-banner";
import { FurnaceProgramSection } from "./components/furnace-program-section";
import { GasProgramSection } from "./components/gas-program-section";
import { PrecursorsSection } from "./components/precursors-section";
import { PrecheckSection } from "./components/precheck-section";
import { ProcessObservationSection } from "./components/process-observation-section";
import { ResultSummarySection } from "./components/result-summary-section";
import { SubstratesSection } from "./components/substrates-section";
import { ValidationSummary } from "./components/validation-summary";
import {
  createInitialEditorValues,
  createModulePayloadMap,
  type EditorSectionKey,
  type ModulePayloadMap,
  type VocabularySelectOption,
} from "./editor-types";
import { useExperimentEditor } from "./use-experiment-editor";

const sectionAnchorList: { key: EditorSectionKey; label: string }[] = [
  { key: "basic_info", label: "基础信息" },
  { key: "environment", label: "环境条件" },
  { key: "precheck", label: "预检查" },
  { key: "precursors", label: "前驱体" },
  { key: "substrates", label: "基底" },
  { key: "furnace_program", label: "炉温程序" },
  { key: "gas_program", label: "气体程序" },
  { key: "process_observation", label: "过程观察" },
  { key: "characterization", label: "表征结果" },
  { key: "result_summary", label: "结果总结" },
];

function toVocabularyOptions(
  items: ControlledVocabularyRead[] | undefined,
): VocabularySelectOption[] {
  return (items ?? []).map((item) => ({
    label: item.label_zh || item.label_en || item.value,
    value: item.value,
  }));
}

function useActiveVocabularyOptions({
  accessToken,
  currentUserId,
  vocabKey,
}: {
  accessToken: string;
  currentUserId: string;
  vocabKey: string;
}) {
  const query = useQuery({
    queryKey: ["vocabularies", vocabKey, currentUserId],
    queryFn: () => listActiveVocabularies(accessToken, vocabKey),
    enabled: Boolean(accessToken),
  });

  return useMemo(() => toVocabularyOptions(query.data?.items), [query.data?.items]);
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

function ExperimentEditorWorkspace({
  accessToken,
  currentUserId,
  experimentId,
  inheritFrom,
  initialExperiment,
  initialModulePayloads,
  initialValues,
  onInheritanceConsumed,
}: {
  accessToken: string;
  currentUserId: string;
  experimentId: string;
  inheritFrom?: string | null;
  initialExperiment: ReturnType<typeof getExperiment> extends Promise<infer T> ? T : never;
  initialModulePayloads: ModulePayloadMap;
  initialValues: ReturnType<typeof createInitialEditorValues>;
  onInheritanceConsumed?: () => void;
}) {
  const navigate = useNavigate();
  const { modal } = App.useApp();
  const editor = useExperimentEditor({
    accessToken,
    currentUserId,
    experimentId,
    inheritFrom,
    initialExperiment,
    initialModulePayloads,
    initialValues,
    onInheritanceConsumed,
  });
  const dataRouterContext = useContext(DataRouterContext);
  const editorDisabled = !editor.isDraft || editor.isSubmitting;
  const materialSystemOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: "material_system",
  });
  const precursorMethodOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: "precursor_method",
  });
  const substrateTypeOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: "substrate_type",
  });
  const substrateTreatmentMethodOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: "substrate_treatment_method",
  });
  const gasOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: "gas_label",
  });
  const characterizationMethodOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: "characterization_method",
  });
  const recipeTemplatesQuery = useQuery({
    queryKey: ["recipes", "active", "experiment-editor", currentUserId],
    queryFn: () => listActiveRecipes(accessToken),
    enabled: Boolean(accessToken),
  });
  const recipeTemplates = recipeTemplatesQuery.data?.items ?? [];

  const [currentSection, setCurrentSection] = useState<EditorSectionKey>("basic_info");
  const [diffOpen, setDiffOpen] = useState(false);
  const sourceModulesQuery = useQuery({
    queryKey: [
      "experiments",
      "modules",
      currentUserId,
      editor.experiment.derived_from_run_id,
      "diff-source",
    ],
    queryFn: () => listExperimentModules(accessToken, editor.experiment.derived_from_run_id!),
    enabled: diffOpen && Boolean(editor.experiment.derived_from_run_id),
  });
  const sourceModulePayloads = useMemo(() => {
    if (!sourceModulesQuery.data) {
      return {};
    }

    return createModulePayloadMap(sourceModulesQuery.data.items);
  }, [sourceModulesQuery.data]);

  const scrollToSection = (moduleKey: string) => {
    setCurrentSection(moduleKey as EditorSectionKey);
    const section = document.getElementById(`section-${moduleKey}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const currentSectionIndex = sectionAnchorList.findIndex((s) => s.key === currentSection);
  const goPrev = () => {
    if (currentSectionIndex > 0) {
      scrollToSection(sectionAnchorList[currentSectionIndex - 1].key);
    }
  };
  const goNext = () => {
    if (currentSectionIndex < sectionAnchorList.length - 1) {
      scrollToSection(sectionAnchorList[currentSectionIndex + 1].key);
    }
  };

  const stepperItems: StepperItem[] = useMemo(() => {
    return sectionAnchorList.map((s) => {
      const state = editor.sectionStates[s.key];
      const completion = editor.moduleCompletionMap[s.key];
      let status: StepperItem["status"] = "empty";
      if (s.key === currentSection) {
        status = "current";
      } else if (state.status === "error") {
        status = "error";
      } else if (state.status === "saved") {
        status = "saved";
      } else if (state.status === "saving") {
        status = "editing";
      }
      return { key: s.key, label: s.label, status, completion };
    });
  }, [editor.moduleCompletionMap, editor.sectionStates, currentSection]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            const key = id.replace("section-", "") as EditorSectionKey;
            setCurrentSection(key);
          }
        });
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 },
    );

    sectionAnchorList.forEach((s) => {
      const el = document.getElementById(`section-${s.key}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const navigateToDetail = () => {
    if (editor.shouldWarnOnLeave && !dataRouterContext) {
      modal.confirm({
        title: "离开确认",
        content: editor.leaveWarning,
        maskTransitionName: "",
        transitionName: "",
        okText: "离开",
        okButtonProps: { "aria-label": "离开" },
        cancelText: "留下",
        cancelButtonProps: { "aria-label": "留下" },
        onOk: () => {
          navigate(`/experiments/${editor.experiment.id}`);
        },
      });
      return;
    }

    navigate(`/experiments/${editor.experiment.id}`);
  };

  return (
    <div className="content-stack experiment-editor-page">
      {dataRouterContext ? (
        <RouteLeaveGuard message={editor.leaveWarning} when={editor.shouldWarnOnLeave} />
      ) : null}
      <PageHeader subtitle="各模块修改后自动保存，提交后不可再编辑。" title={`编辑 ${editor.experiment.run_code}`} />
      <ExperimentSourceBanner
        experiment={editor.experiment}
        onViewDiff={editor.experiment.derived_from_run_id ? () => setDiffOpen(true) : undefined}
      />
      <ExperimentDiffModal
        currentModules={editor.currentModulePayloads}
        errorMessage={
          sourceModulesQuery.isError
            ? resolveErrorMessage(sourceModulesQuery.error, "来源实验参数加载失败")
            : null
        }
        loading={sourceModulesQuery.isFetching}
        onClose={() => setDiffOpen(false)}
        open={diffOpen}
        sourceModules={sourceModulePayloads}
        sourceRunCode={editor.experiment.derived_from_run_code}
      />
      {editor.inheritanceError ? (
        <Alert title={editor.inheritanceError} showIcon type="error" />
      ) : null}
      {editor.validationResult ? (
        <ValidationSummary
          onJumpToModule={scrollToSection}
          result={editor.validationResult}
        />
      ) : null}
      <div className="editor-workspace-layout">
        <EditorStepper
          currentKey={currentSection}
          items={stepperItems}
          onChange={(key) => {
            scrollToSection(key);
          }}
        />
        <div className="content-stack" style={{ flex: 1, minWidth: 0 }}>
          <div className="editor-anchor-target" id="section-basic_info">
            <EditorSectionCard
              state={editor.sectionStates.basic_info}
              subtitle="主记录和基础信息模块会一起保存。"
              title="基础信息"
            >
              <ExperimentMainFields
                disabled={editorDisabled}
                materialSystemOptions={materialSystemOptions}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    basicInfo: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                value={editor.values.basicInfo}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-environment">
            <EditorSectionCard
              state={editor.sectionStates.environment}
              subtitle="记录实验时的环境条件。"
              title="环境条件"
            >
              <EnvironmentSection
                disabled={editorDisabled}
                inheritedFrom={editor.inheritedFrom.environment}
                onChange={(nextValue) => {
                  editor.clearInheritedSection("environment");
                  editor.updateValues((current) => ({
                    ...current,
                    environment: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                value={editor.values.environment}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-precheck">
            <EditorSectionCard
              state={editor.sectionStates.precheck}
              subtitle="密封检查未通过时须填写风险说明。"
              title="预检查"
            >
              <PrecheckSection
                disabled={editorDisabled}
                inheritedFrom={editor.inheritedFrom.precheck}
                onChange={(nextValue) => {
                  editor.clearInheritedSection("precheck");
                  editor.updateValues((current) => ({
                    ...current,
                    precheck: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                value={editor.values.precheck}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-precursors">
            <EditorSectionCard
              state={editor.sectionStates.precursors}
              subtitle="至少保留一条前驱体记录。"
              title="前驱体"
            >
              <PrecursorsSection
                disabled={editorDisabled}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    precursors: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                precursorMethodOptions={precursorMethodOptions}
                value={editor.values.precursors}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-substrates">
            <EditorSectionCard
              state={editor.sectionStates.substrates}
              subtitle="上下基底会自动生成对应的样品记录。"
              title="基底"
            >
              <SubstratesSection
                disabled={editorDisabled}
                gasOptions={gasOptions}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    substrates: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                substrateTreatmentMethodOptions={substrateTreatmentMethodOptions}
                substrateTypeOptions={substrateTypeOptions}
                value={editor.values.substrates}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-furnace_program">
            <EditorSectionCard
              state={editor.sectionStates.furnace_program}
              subtitle="至少一个温区，时间点须严格递增。"
              title="炉温程序"
            >
              <FurnaceProgramSection
                disabled={editorDisabled}
                materialSystem={editor.values.basicInfo.materialSystem}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    furnaceProgram: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                recipeTemplates={recipeTemplates}
                value={editor.values.furnaceProgram}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-gas_program">
            <EditorSectionCard
              state={editor.sectionStates.gas_program}
              subtitle="可选填写，时间段不能重叠。"
              title="气体程序"
            >
              <GasProgramSection
                disabled={editorDisabled}
                gasOptions={gasOptions}
                materialSystem={editor.values.basicInfo.materialSystem}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    gasProgram: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                recipeTemplates={recipeTemplates}
                value={editor.values.gasProgram}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-process_observation">
            <EditorSectionCard
              state={editor.sectionStates.process_observation}
              subtitle="记录过程中的颜色变化、沉积和异常现象。"
              title="过程观察"
            >
              <ProcessObservationSection
                disabled={editorDisabled}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    processObservation: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                value={editor.values.processObservation}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-characterization">
            <EditorSectionCard
              state={editor.sectionStates.characterization}
              subtitle="记录表征方法和结果。"
              title="表征结果"
            >
              <CharacterizationSection
                characterizationMethodOptions={characterizationMethodOptions}
                disabled={editorDisabled}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    characterization: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                value={editor.values.characterization}
              />
            </EditorSectionCard>
          </div>
          <div className="editor-anchor-target" id="section-result_summary">
            <EditorSectionCard
              state={editor.sectionStates.result_summary}
              subtitle="总结会同步到实验主记录，方便列表和详情页直接读取。"
              title="结果总结"
            >
              <ResultSummarySection
                disabled={editorDisabled}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    resultSummary: nextValue,
                  }));
                  editor.scheduleAutosave();
                }}
                value={editor.values.resultSummary}
              />
            </EditorSectionCard>
          </div>
        </div>
      </div>
      <EditorActionBar
        completionSummary={editor.completionSummary}
        experiment={editor.experiment}
        isDraft={editor.isDraft}
        onBack={navigateToDetail}
        onNext={goNext}
        onPrev={goPrev}
        onSubmit={editor.submitDraft}
        saveSummary={editor.saveSummary}
        submitState={editor.submitState}
      />
    </div>
  );
}

export function ExperimentEditorPage() {
  const { experimentId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuth();
  const currentUserId = session.currentUser?.id ?? "anonymous";
  const inheritFrom = searchParams.get("inheritFrom");

  const experimentQuery = useQuery({
    queryKey: ["experiments", "editor", currentUserId, experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });
  const modulesQuery = useQuery({
    queryKey: ["experiments", "modules", currentUserId, experimentId],
    queryFn: () => listExperimentModules(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  });

  const initialValues = useMemo(() => {
    if (!experimentQuery.data || !modulesQuery.data) {
      return null;
    }

    return createInitialEditorValues(experimentQuery.data, modulesQuery.data.items);
  }, [experimentQuery.data, modulesQuery.data]);
  const initialModulePayloads = useMemo(() => {
    if (!modulesQuery.data) {
      return null;
    }

    return createModulePayloadMap(modulesQuery.data.items);
  }, [modulesQuery.data]);

  if (experimentQuery.isLoading || modulesQuery.isLoading) {
    return <LoadingState />;
  }

  if (experimentQuery.error || modulesQuery.error) {
    const error = experimentQuery.error ?? modulesQuery.error;

    return (
      <div className="content-stack">
        <PageHeader
          actions={
            <Button
              onClick={() => {
                navigate("/experiments");
              }}
            >
              返回列表
            </Button>
          }
          subtitle="无法加载实验编辑器，请检查网络连接、账号权限或实验状态。"
          title="实验编辑器"
        />
        <Alert
          title={
            error instanceof HttpError ? error.detail || "实验编辑器加载失败" : "实验编辑器加载失败"
          }
          showIcon
          type="error"
        />
      </div>
    );
  }

  if (!experimentQuery.data || !initialValues || !initialModulePayloads) {
    return (
      <Alert
        title="实验编辑器暂不可用"
        showIcon
        type="warning"
      />
    );
  }

  return (
    <ExperimentEditorWorkspace
      accessToken={session.accessToken!}
      currentUserId={currentUserId}
      experimentId={experimentId}
      inheritFrom={inheritFrom}
      initialExperiment={experimentQuery.data}
      initialModulePayloads={initialModulePayloads}
      initialValues={initialValues}
      onInheritanceConsumed={() => {
        const nextSearchParams = new URLSearchParams(searchParams);
        nextSearchParams.delete("inheritFrom");
        navigate(
          {
            pathname: location.pathname,
            search: nextSearchParams.toString(),
          },
          { replace: true },
        );
      }}
    />
  );
}
