import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Spin } from "antd";
import { useNavigate, useParams } from "react-router-dom";

import { HttpError } from "../../shared/api/http-error";
import { PageHeader } from "../../shared/ui/page-header";
import { useAuth } from "../auth/use-auth";
import { getExperiment, listExperimentModules } from "./api";
import { EditorStatusBar } from "./components/editor-status-bar";
import { EditorSectionCard } from "./components/editor-section-card";
import { ExperimentMainFields } from "./components/experiment-main-fields";
import { FurnaceProgramSection } from "./components/furnace-program-section";
import { GasProgramSection } from "./components/gas-program-section";
import { PrecursorsSection } from "./components/precursors-section";
import { PrecheckSection } from "./components/precheck-section";
import { SubstratesSection } from "./components/substrates-section";
import { createInitialEditorValues } from "./editor-types";
import { useExperimentEditor } from "./use-experiment-editor";

function ExperimentEditorWorkspace({
  accessToken,
  currentUserId,
  experimentId,
  initialExperiment,
  initialValues,
}: {
  accessToken: string;
  currentUserId: string;
  experimentId: string;
  initialExperiment: ReturnType<typeof getExperiment> extends Promise<infer T> ? T : never;
  initialValues: ReturnType<typeof createInitialEditorValues>;
}) {
  const navigate = useNavigate();
  const editor = useExperimentEditor({
    accessToken,
    currentUserId,
    experimentId,
    initialExperiment,
    initialValues,
  });

  return (
    <div className="content-stack" key={`${initialExperiment.id}:${initialExperiment.updated_at}`}>
      <PageHeader
        actions={
          <Button
            onClick={() => {
              navigate(`/experiments/${editor.experiment.id}`);
            }}
          >
            查看详情
          </Button>
        }
        subtitle="核心模块现已接入自动保存和提交闭环，非 draft 状态下会保持只读。"
        title={`编辑 ${editor.experiment.run_code}`}
      />
      <EditorStatusBar
        experiment={editor.experiment}
        isDraft={editor.isDraft}
        onSubmit={editor.submitDraft}
        submitState={editor.submitState}
        summary={editor.saveSummary}
      />
      <EditorSectionCard
        state={editor.sectionStates.basic_info}
        subtitle="主记录和 basic_info 模块会一起保存，确保列表、详情和模块数据一致。"
        title="基础信息"
      >
        <ExperimentMainFields
          disabled={!editor.isDraft}
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
      <EditorSectionCard
        state={editor.sectionStates.precheck}
        subtitle="提交前如果密封检查失败，必须补齐风险说明。"
        title="预检查"
      >
        <PrecheckSection
          disabled={!editor.isDraft}
          onChange={(nextValue) => {
            editor.updateValues((current) => ({
              ...current,
              precheck: nextValue,
            }));
            editor.scheduleAutosave();
          }}
          value={editor.values.precheck}
        />
      </EditorSectionCard>
      <EditorSectionCard
        state={editor.sectionStates.precursors}
        subtitle="至少保留一条有效前驱体记录。"
        title="前驱体"
      >
        <PrecursorsSection
          disabled={!editor.isDraft}
          onChange={(nextValue) => {
            editor.updateValues((current) => ({
              ...current,
              precursors: nextValue,
            }));
            editor.scheduleAutosave();
          }}
          value={editor.values.precursors}
        />
      </EditorSectionCard>
      <EditorSectionCard
        state={editor.sectionStates.substrates}
        subtitle="top / bottom 会同步生成或更新样品记录。"
        title="基底"
      >
        <SubstratesSection
          disabled={!editor.isDraft}
          onChange={(nextValue) => {
            editor.updateValues((current) => ({
              ...current,
              substrates: nextValue,
            }));
            editor.scheduleAutosave();
          }}
          value={editor.values.substrates}
        />
      </EditorSectionCard>
      <EditorSectionCard
        state={editor.sectionStates.furnace_program}
        subtitle="提交时要求至少一个温区，且每个温区的时间点严格递增。"
        title="炉温程序"
      >
        <FurnaceProgramSection
          disabled={!editor.isDraft}
          onChange={(nextValue) => {
            editor.updateValues((current) => ({
              ...current,
              furnaceProgram: nextValue,
            }));
            editor.scheduleAutosave();
          }}
          value={editor.values.furnaceProgram}
        />
      </EditorSectionCard>
      <EditorSectionCard
        state={editor.sectionStates.gas_program}
        subtitle="气体程序可为空；一旦填写，时间段必须合法且不能重叠。"
        title="气体程序"
      >
        <GasProgramSection
          disabled={!editor.isDraft}
          onChange={(nextValue) => {
            editor.updateValues((current) => ({
              ...current,
              gasProgram: nextValue,
            }));
            editor.scheduleAutosave();
          }}
          value={editor.values.gasProgram}
        />
      </EditorSectionCard>
    </div>
  );
}

export function ExperimentEditorPage() {
  const { experimentId = "" } = useParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const currentUserId = session.currentUser?.id ?? "anonymous";

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

  if (experimentQuery.isLoading || modulesQuery.isLoading) {
    return (
      <div className="centered-panel">
        <Spin />
      </div>
    );
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
          subtitle="当前请求未成功完成。"
          title="实验编辑器"
        />
        <Alert
          message={
            error instanceof HttpError ? error.detail || "实验编辑器加载失败" : "实验编辑器加载失败"
          }
          showIcon
          type="error"
        />
      </div>
    );
  }

  if (!experimentQuery.data || !initialValues) {
    return (
      <Alert
        message="实验编辑器暂不可用"
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
      initialExperiment={experimentQuery.data}
      initialValues={initialValues}
    />
  );
}
