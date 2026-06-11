import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { GitCompare, TriangleAlert } from 'lucide-react'

import { Route } from '@/routes/_authed/experiments/$experimentId/edit'
import { HttpError, resolveErrorMessage } from '@/shared/api/http-error'
import { PageHeader } from '@/shared/ui/page-header'
import { LoadingState } from '@/shared/ui/loading-state'
import { RouteLeaveGuard } from '@/shared/ui/route-leave-guard'
import type {
  ControlledVocabularyRead,
  ExperimentRead,
  FileAssetRead,
  SetupLibraryRead,
} from '@/shared/types/api'
import { useAuth } from '@/features/auth/use-auth'
import { listSetupLibrary } from '@/features/setup-library/api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  getExperiment,
  getSetupMethods,
  listActiveVocabularies,
  listExperimentFiles,
  listExperimentModules,
} from './api'
import { CharacterizationSection } from './components/characterization-section'
import { EditorActionBar } from './components/editor-action-bar'
import { EditorSectionCard } from './components/editor-section-card'
import { EditorStepper } from './components/editor-stepper'
import type { StepperItem } from './components/editor-stepper'
import { EnvironmentSection } from './components/environment-section'
import { ExperimentMainFields } from './components/experiment-main-fields'
import { ExperimentDiffModal } from './components/experiment-diff-modal'
import { ExperimentSourceBanner } from './components/experiment-source-banner'
import { FurnaceProgramSection } from './components/furnace-program-section'
import { GasProgramSection } from './components/gas-program-section'
import { PrecursorsSection } from './components/precursors-section'
import { PrecheckSection } from './components/precheck-section'
import { ProcessObservationSection } from './components/process-observation-section'
import { ResultSummarySection } from './components/result-summary-section'
import { SetupMethodsSection } from './components/setup-methods-section'
import { SubstratesSection } from './components/substrates-section'
import { ValidationSummary } from './components/validation-summary'
import { VersionHistoryDialog } from './components/version-history-dialog'
import type {
  EditorSectionKey,
  ModulePayloadMap,
  VocabularySelectOption,
} from './editor-types'
import {
  createInitialEditorValues,
  createModulePayloadMap,
} from './editor-types'
import { useExperimentEditor } from './use-experiment-editor'

const sectionAnchorList: { key: EditorSectionKey; label: string }[] = [
  { key: 'basic_info', label: '基础信息' },
  { key: 'setup_methods', label: 'Setup / Methods' },
  { key: 'environment', label: '环境条件' },
  { key: 'precheck', label: '预检查' },
  { key: 'precursors', label: '前驱体' },
  { key: 'substrates', label: '基底' },
  { key: 'furnace_program', label: '炉温程序' },
  { key: 'gas_program', label: '气体程序' },
  { key: 'process_observation', label: '过程观察' },
  { key: 'characterization', label: '表征结果' },
  { key: 'result_summary', label: '结果总结' },
]

function toVocabularyOptions(
  items: ControlledVocabularyRead[] | undefined,
): VocabularySelectOption[] {
  return (items ?? []).map((item) => ({
    label: item.label_zh || item.label_en || item.value,
    value: item.value,
    groupKey: item.group_key,
    groupLabel: item.group_label_zh || item.group_label_en,
    groupSortOrder: item.group_sort_order,
  }))
}

function useActiveVocabularyOptions({
  accessToken,
  currentUserId,
  vocabKey,
}: {
  accessToken: string
  currentUserId: string
  vocabKey: string
}) {
  const query = useQuery({
    queryKey: ['vocabularies', vocabKey, currentUserId],
    queryFn: () => listActiveVocabularies(accessToken, vocabKey),
    enabled: Boolean(accessToken),
  })

  return useMemo(
    () => toVocabularyOptions(query.data?.items),
    [query.data?.items],
  )
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
  setupDiagramFiles,
  setupLibraryEntries,
}: {
  accessToken: string
  currentUserId: string
  experimentId: string
  inheritFrom?: string | null
  initialExperiment: ExperimentRead
  initialModulePayloads: ModulePayloadMap
  initialValues: ReturnType<typeof createInitialEditorValues>
  onInheritanceConsumed?: () => void
  setupDiagramFiles: FileAssetRead[]
  setupLibraryEntries: SetupLibraryRead[]
}) {
  const navigate = useNavigate()
  const editor = useExperimentEditor({
    accessToken,
    currentUserId,
    experimentId,
    inheritFrom,
    initialExperiment,
    initialModulePayloads,
    initialValues,
    onInheritanceConsumed,
  })
  const editorDisabled = !editor.isEditable || editor.isSubmitting
  const [versionsOpen, setVersionsOpen] = useState(false)
  const materialSystemOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'material_system',
  })
  const precursorBrandOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'precursor_brand',
  })
  const precursorMethodOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'precursor_method',
  })
  const substrateTypeOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'substrate_type',
  })
  const substrateBrandOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'substrate_brand',
  })
  const substrateSizeOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'substrate_size',
  })
  const substrateTreatmentMethodOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'substrate_treatment_method',
  })
  const gasOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'gas_label',
  })
  const characterizationMethodOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'characterization_method',
  })
  const failureModeOptions = useActiveVocabularyOptions({
    accessToken,
    currentUserId,
    vocabKey: 'failure_mode',
  })
  const [currentSection, setCurrentSection] =
    useState<EditorSectionKey>('basic_info')
  const [diffOpen, setDiffOpen] = useState(false)
  const sourceModulesQuery = useQuery({
    queryKey: [
      'experiments',
      'modules',
      currentUserId,
      editor.experiment.derived_from_run_id,
      'diff-source',
    ],
    queryFn: () =>
      listExperimentModules(
        accessToken,
        editor.experiment.derived_from_run_id!,
      ),
    enabled: diffOpen && Boolean(editor.experiment.derived_from_run_id),
  })
  const sourceModulePayloads = useMemo(() => {
    if (!sourceModulesQuery.data) {
      return {}
    }

    return createModulePayloadMap(sourceModulesQuery.data.items)
  }, [sourceModulesQuery.data])

  const scrollToSection = useCallback((moduleKey: string) => {
    setCurrentSection(moduleKey as EditorSectionKey)
    const section = document.getElementById(`section-${moduleKey}`)
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const stepperItems: StepperItem[] = useMemo(() => {
    return sectionAnchorList.map((s) => {
      const state = editor.sectionStates[s.key]
      const completion = editor.moduleCompletionMap[s.key]
      let status: StepperItem['status'] = 'empty'
      if (s.key === currentSection) {
        status = 'current'
      } else if (state.status === 'error') {
        status = 'error'
      } else if (state.status === 'saved') {
        status = 'saved'
      } else if (state.status === 'saving') {
        status = 'editing'
      }
      return { key: s.key, label: s.label, status, completion }
    })
  }, [editor.moduleCompletionMap, editor.sectionStates, currentSection])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // When several sections fall inside the active band at once (notably on
        // initial mount), `forEach` + last-wins would highlight an arbitrary
        // section. Pick the topmost intersecting one so the stepper matches what
        // the user actually sees.
        const topmost = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0]
        if (topmost) {
          const key = topmost.target.id.replace(
            'section-',
            '',
          ) as EditorSectionKey
          setCurrentSection(key)
        }
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 },
    )

    sectionAnchorList.forEach((s) => {
      const el = document.getElementById(`section-${s.key}`)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const firstError = editor.validationResult?.errors[0]
    if (!firstError) {
      return
    }

    const section = document.getElementById(`section-${firstError.module_key}`)
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [editor.validationResult])

  const navigateToDetail = () => {
    void navigate({
      to: '/experiments/$experimentId',
      params: { experimentId: editor.experiment.id },
    })
  }

  // Sections whose local validation is blocking autosave — surfaced prominently
  // so a format error in one field can't silently stop a whole section saving.
  const autosaveBlockedSections = sectionAnchorList.filter(
    (section) => editor.sectionStates[section.key]?.status === 'error',
  )

  return (
    <div className="flex flex-col gap-6">
      <RouteLeaveGuard
        message={editor.leaveWarning}
        when={editor.shouldWarnOnLeave}
      />
      <PageHeader
        actions={
          <div className="flex flex-wrap gap-2">
            {editor.experiment.derived_from_run_id ? (
              <Button variant="outline" onClick={() => setDiffOpen(true)}>
                <GitCompare className="size-4" />
                查看差异
              </Button>
            ) : null}
            {!editor.isDraft ? (
              <Button variant="outline" onClick={() => setVersionsOpen(true)}>
                版本历史
              </Button>
            ) : null}
            <Button variant="outline" onClick={navigateToDetail}>
              返回详情
            </Button>
          </div>
        }
        subtitle="各模块修改后自动保存；提交后仍可就地编辑，并可存为新版本。"
        title={`编辑 ${editor.experiment.run_code}`}
      />
      <ExperimentSourceBanner experiment={editor.experiment} />
      <ExperimentDiffModal
        currentModules={editor.currentModulePayloads}
        errorMessage={
          sourceModulesQuery.isError
            ? resolveErrorMessage(
                sourceModulesQuery.error,
                '来源实验参数加载失败',
              )
            : null
        }
        loading={sourceModulesQuery.isFetching}
        onClose={() => setDiffOpen(false)}
        open={diffOpen}
        sourceModules={sourceModulePayloads}
        sourceRunCode={editor.experiment.derived_from_run_code}
      />
      {editor.inheritanceError ? (
        <Alert variant="destructive">
          <AlertDescription>{editor.inheritanceError}</AlertDescription>
        </Alert>
      ) : null}
      {autosaveBlockedSections.length > 0 ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>
            以下区块
            <span className="font-medium">暂未自动保存</span>
            （填写格式有误或保存失败），请修正或稍后重试；离开本页会提示未保存：{' '}
            {autosaveBlockedSections.map((section, index) => (
              <span key={section.key}>
                <button
                  type="button"
                  onClick={() => scrollToSection(section.key)}
                  className="font-medium underline underline-offset-2 hover:opacity-80"
                >
                  {section.label}
                </button>
                {index < autosaveBlockedSections.length - 1 ? '、' : ''}
              </span>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}
      {editor.validationResult ? (
        <ValidationSummary
          onJumpToModule={scrollToSection}
          result={editor.validationResult}
        />
      ) : null}
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
        <EditorStepper
          currentKey={currentSection}
          items={stepperItems}
          onChange={(key) => scrollToSection(key)}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="scroll-mt-24" id="section-basic_info">
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
                  }))
                  editor.scheduleAutosave()
                }}
                value={editor.values.basicInfo}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-setup_methods">
            <EditorSectionCard
              state={editor.sectionStates.setup_methods}
              subtitle="记录实验装置、方法文本、setup diagram 与确认状态。"
              title="Setup / Methods"
            >
              <SetupMethodsSection
                disabled={editorDisabled}
                files={setupDiagramFiles}
                onApplyLibrary={editor.applySetupLibrary}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    setupMethods: nextValue,
                  }))
                  editor.scheduleAutosave()
                }}
                libraryOptions={setupLibraryEntries}
                value={editor.values.setupMethods}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-environment">
            <EditorSectionCard
              state={editor.sectionStates.environment}
              subtitle="记录实验时的环境条件。"
              title="环境条件"
            >
              <EnvironmentSection
                disabled={editorDisabled}
                inheritedFrom={editor.inheritedFrom.environment}
                onChange={(nextValue) => {
                  editor.clearInheritedSection('environment')
                  editor.updateValues((current) => ({
                    ...current,
                    environment: nextValue,
                  }))
                  editor.scheduleAutosave()
                }}
                value={editor.values.environment}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-precheck">
            <EditorSectionCard
              state={editor.sectionStates.precheck}
              subtitle="密封检查未通过时须填写风险说明。"
              title="预检查"
            >
              <PrecheckSection
                disabled={editorDisabled}
                inheritedFrom={editor.inheritedFrom.precheck}
                onChange={(nextValue) => {
                  editor.clearInheritedSection('precheck')
                  editor.updateValues((current) => ({
                    ...current,
                    precheck: nextValue,
                  }))
                  editor.scheduleAutosave()
                }}
                value={editor.values.precheck}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-precursors">
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
                  }))
                  editor.scheduleAutosave()
                }}
                precursorBrandOptions={precursorBrandOptions}
                precursorMethodOptions={precursorMethodOptions}
                value={editor.values.precursors}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-substrates">
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
                  }))
                  editor.scheduleAutosave()
                }}
                substrateBrandOptions={substrateBrandOptions}
                substrateSizeOptions={substrateSizeOptions}
                substrateTreatmentMethodOptions={
                  substrateTreatmentMethodOptions
                }
                substrateTypeOptions={substrateTypeOptions}
                value={editor.values.substrates}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-furnace_program">
            <EditorSectionCard
              state={editor.sectionStates.furnace_program}
              subtitle="至少一个温区，时间点须严格递增。"
              title="炉温程序"
            >
              <FurnaceProgramSection
                disabled={editorDisabled}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    furnaceProgram: nextValue,
                  }))
                  editor.scheduleAutosave()
                }}
                precursorItems={editor.values.precursors.items}
                value={editor.values.furnaceProgram}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-gas_program">
            <EditorSectionCard
              state={editor.sectionStates.gas_program}
              subtitle="可选填写，时间段不能重叠。"
              title="气体程序"
            >
              <GasProgramSection
                disabled={editorDisabled}
                gasOptions={gasOptions}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    gasProgram: nextValue,
                  }))
                  editor.scheduleAutosave()
                }}
                value={editor.values.gasProgram}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-process_observation">
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
                  }))
                  editor.scheduleAutosave()
                }}
                value={editor.values.processObservation}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-characterization">
            <EditorSectionCard
              state={editor.sectionStates.characterization}
              subtitle="记录表征方法和结果。"
              title="表征结果"
            >
              <CharacterizationSection
                characterizationMethodOptions={characterizationMethodOptions}
                disabled={editorDisabled}
                experimentId={experimentId}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    characterization: nextValue,
                  }))
                  editor.scheduleAutosave()
                }}
                value={editor.values.characterization}
              />
            </EditorSectionCard>
          </div>
          <div className="scroll-mt-24" id="section-result_summary">
            <EditorSectionCard
              state={editor.sectionStates.result_summary}
              subtitle="总结会同步到实验主记录，方便列表和详情页直接读取。"
              title="结果总结"
            >
              <ResultSummarySection
                disabled={editorDisabled}
                failureModeOptions={failureModeOptions}
                onChange={(nextValue) => {
                  editor.updateValues((current) => ({
                    ...current,
                    resultSummary: nextValue,
                  }))
                  editor.scheduleAutosave()
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
        saveDraftLoading={editor.hasSavingSections}
        isDraft={editor.isDraft}
        isSubmitted={editor.isSubmitted}
        onOpenVersions={() => setVersionsOpen(true)}
        onSaveDraft={editor.saveDraft}
        onSubmit={editor.submitDraft}
        saveSummary={editor.saveSummary}
        submitState={editor.submitState}
      />
      <VersionHistoryDialog
        accessToken={accessToken}
        currentUserId={currentUserId}
        experimentId={experimentId}
        isSubmitted={editor.isSubmitted}
        isSubmitting={editor.isSubmitting}
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        onRestored={() => window.location.reload()}
        onSaveVersion={editor.saveNewVersion}
      />
    </div>
  )
}

export function ExperimentEditorPage() {
  const { experimentId } = Route.useParams()
  const { inheritFrom } = Route.useSearch()
  const navigate = useNavigate()
  const { session } = useAuth()
  const currentUserId = session.currentUser?.id ?? 'anonymous'

  const experimentQuery = useQuery({
    queryKey: ['experiments', 'editor', currentUserId, experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })
  const modulesQuery = useQuery({
    queryKey: ['experiments', 'modules', currentUserId, experimentId],
    queryFn: () => listExperimentModules(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })
  const setupMethodsQuery = useQuery({
    queryKey: ['experiments', 'setup-methods', currentUserId, experimentId],
    queryFn: async () => {
      try {
        return await getSetupMethods(session.accessToken!, experimentId)
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: session.isAuthenticated && Boolean(experimentId),
  })
  const setupLibraryQuery = useQuery({
    queryKey: ['setup-library', currentUserId],
    queryFn: () => listSetupLibrary(session.accessToken!),
    enabled: session.isAuthenticated,
  })
  const setupDiagramFilesQuery = useQuery({
    queryKey: [
      'experiments',
      'files',
      currentUserId,
      experimentId,
      'setup_diagram',
    ],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, {
        experimentId,
        assetRole: 'setup_diagram',
      }),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const initialValues = useMemo(() => {
    if (
      !experimentQuery.data ||
      !modulesQuery.data ||
      setupMethodsQuery.data === undefined
    ) {
      return null
    }

    return createInitialEditorValues(
      experimentQuery.data,
      modulesQuery.data.items,
      setupMethodsQuery.data,
    )
  }, [experimentQuery.data, modulesQuery.data, setupMethodsQuery.data])
  const initialModulePayloads = useMemo(() => {
    if (!modulesQuery.data) {
      return null
    }

    return createModulePayloadMap(modulesQuery.data.items)
  }, [modulesQuery.data])

  if (
    experimentQuery.isLoading ||
    modulesQuery.isLoading ||
    setupMethodsQuery.isLoading ||
    setupLibraryQuery.isLoading ||
    setupDiagramFilesQuery.isLoading
  ) {
    return <LoadingState />
  }

  if (
    experimentQuery.error ||
    modulesQuery.error ||
    setupMethodsQuery.error ||
    setupLibraryQuery.error ||
    setupDiagramFilesQuery.error
  ) {
    const error =
      experimentQuery.error ??
      modulesQuery.error ??
      setupMethodsQuery.error ??
      setupLibraryQuery.error ??
      setupDiagramFilesQuery.error

    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          actions={
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/experiments' })}
            >
              返回列表
            </Button>
          }
          subtitle="无法加载实验编辑器，请检查网络连接、账号权限或实验状态。"
          title="实验编辑器"
        />
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(error, '实验编辑器加载失败')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!experimentQuery.data || !initialValues || !initialModulePayloads) {
    return (
      <Alert className="border-warning/40 bg-warning-soft [&>svg]:text-warning">
        <AlertDescription className="text-foreground">
          实验编辑器暂不可用
        </AlertDescription>
      </Alert>
    )
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
      setupDiagramFiles={setupDiagramFilesQuery.data?.items ?? []}
      setupLibraryEntries={setupLibraryQuery.data?.items ?? []}
      onInheritanceConsumed={() => {
        void navigate({
          to: '/experiments/$experimentId/edit',
          params: { experimentId },
          search: {},
          replace: true,
        })
      }}
    />
  )
}
