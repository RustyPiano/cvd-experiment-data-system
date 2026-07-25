// 炉次表单编排：新建态只收集开始记录所需的三项基本信息；
// 创建后进入详情页，再按节保存完整工艺。
// 保存前用与后端同判据的必填校验拦截，避免直接把 422 抛给用户。payload 键=字段 key。
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { HttpError, resolveErrorMessage } from '@/shared/api/http-error'
import { RouteLeaveGuard } from '@/shared/ui/route-leave-guard'
import { useAuth } from '@/features/auth/use-auth'
import type { V2EntityRead } from '@/features/entity-library/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type {
  ComponentRow,
  ModuleFieldValue,
  ModuleValues,
} from './field-logic'
import {
  buildFlatModulePayload,
  buildItemPayload,
  buildItemsModulePayload,
  buildProcessStepsPayload,
  buildTargetProductPayload,
  getModuleFields,
  isEffectivelyRequired,
  isFieldVisible,
  isNonEmptyComponent,
  isProcessStepActive,
  itemHasAnyValue,
  missingProcessStepKeys,
  missingRequiredKeys,
  moduleValueAsString,
  moduleValueIsEmpty,
  processStepOrderIsValid,
} from './field-logic'
import { toIsoDateTime } from './datetime'
import { createRun, setSetupReference, upsertModule } from './api'
import type {
  TubeUsageHistoryPayload,
  V2ExperimentCreate,
  V2ExperimentRead,
} from './api'
import type { ExperimentV2FormState, ModuleSaveProps } from './form-types'
import { BasicInfoSection } from './components/basic-info-section'
import { TargetProductSection } from './components/target-product-section'
import { EquipmentSection } from './components/equipment-section'
import {
  RepeatableItemsSection,
  materialLotProjectedItem,
} from './components/repeatable-items-section'
import {
  ProcessStepsSection,
  setupFieldTypes,
} from './components/process-steps-section'
import { ResultsSection } from './components/results-section'
import { canonicalOption, localizedFieldLabel } from '@/shared/field-i18n'
import { gasFeedsAreValid } from './components/gas-feeds-editor'
import type { GasFeed } from './components/gas-feeds-editor'
import {
  coolingParamsAreValid,
  durationCyclesAreValid,
  fieldParamsAreValid,
  measuredTemperatureIsValid,
  preparationOperationsAreValid,
} from './components/process-detail-editors'
import type {
  ActualField,
  CoolingParams,
  DurationCycles,
  MeasuredTemperatureReference,
  PreparationOperation,
} from './components/process-detail-editors'
import {
  reconcileTemperatureProgram,
  temperatureProgramIsValid,
} from './components/temperature-program-editor'
import type { TemperatureProgram } from './components/temperature-program-editor'
import { treatmentStepsAreValid } from './components/treatment-steps-editor'
import type { TreatmentStep } from './components/treatment-steps-editor'
import { structuredPayload } from '@/shared/structured-field'

const ESSENTIAL_RUN_KEYS = [
  'started_at',
  'synthesis_method',
  'ambient_temperature_C',
  'ambient_humidity_percent',
  'precheck_confirmed',
]

const FORM_SECTION_LINKS = [
  { id: 'module-basic_info', index: '§1', titleKey: 'basicInfo' },
  { id: 'module-target_product', index: '§1b', titleKey: 'targetProduct' },
  { id: 'module-equipment', index: '§2', titleKey: 'equipment' },
  { id: 'module-precursors', index: '§3', titleKey: 'precursors' },
  { id: 'module-substrates', index: '§4', titleKey: 'substrates' },
  { id: 'module-process_steps', index: '§5', titleKey: 'processSteps' },
  { id: 'module-process_events', index: '§6', titleKey: 'processEvents' },
  { id: 'module-results', index: '§7–8', titleKey: 'results' },
] as const

export function shouldBlockExperimentLeave(
  dirtyCount: number,
  submitting: boolean,
): boolean {
  return dirtyCount > 0 && !submitting
}

function targetProductActive(state: ExperimentV2FormState): boolean {
  const hasFlat = Object.entries(state.target_product).some(
    ([key, value]) => key !== 'components' && !moduleValueIsEmpty(value),
  )
  return hasFlat || state.components.some(isNonEmptyComponent)
}

/** §1b 是否有未补齐的必填（扁平字段 + 结构类型≠本征时的组分）。 */
function targetProductMissing(
  values: ModuleValues,
  components: ComponentRow[],
): boolean {
  for (const field of getModuleFields('target_product')) {
    if (field.key === 'components') {
      if (
        isFieldVisible('target_product', field, values) &&
        isEffectivelyRequired('target_product', field, values) &&
        !components.some(isNonEmptyComponent)
      ) {
        return true
      }
      continue
    }
    if (
      isFieldVisible('target_product', field, values) &&
      isEffectivelyRequired('target_product', field, values) &&
      moduleValueIsEmpty(values[field.key])
    ) {
      return true
    }
  }
  return false
}

function itemsMissing(
  moduleKey: string,
  items: ModuleValues[],
  zoneCount?: number | null,
): boolean {
  return items
    .map((item) => materialLotProjectedItem(moduleKey, item))
    .filter(itemHasAnyValue)
    .some((item) => {
      if (missingRequiredKeys(moduleKey, item).length > 0) return true
      try {
        buildItemPayload(moduleKey, item)
        if (
          moduleKey === 'precursors' &&
          moduleValueAsString(item['source_zone_temperature']).trim()
        ) {
          structuredPayload(
            'source_zone_temperature',
            moduleValueAsString(item['source_zone_temperature']),
            { zoneCount },
          )
        }
        const treatmentKey =
          moduleKey === 'precursors'
            ? 'treatment_steps'
            : moduleKey === 'substrates'
              ? 'pretreatment_steps'
              : null
        if (!treatmentKey) return false
        const raw = moduleValueAsString(item[treatmentKey])
        return (
          raw.trim() !== '' &&
          !treatmentStepsAreValid(
            moduleKey === 'precursors' ? 'precursor' : 'substrate',
            JSON.parse(raw) as TreatmentStep[],
          )
        )
      } catch {
        return true
      }
    })
}

function authoritativeItems(
  moduleKey: string,
  items: ModuleValues[],
): ModuleValues[] {
  return items.map((item) => materialLotProjectedItem(moduleKey, item))
}

function tubeUsageHistoryPayload(
  value: string,
): TubeUsageHistoryPayload | null {
  try {
    return structuredPayload(
      'tube_usage_history',
      value,
    ) as TubeUsageHistoryPayload | null
  } catch {
    return null
  }
}

export function reconcileProcessTemperaturePrograms(
  steps: ModuleValues[],
  setupSnapshot: Record<string, unknown> | null,
): ModuleValues[] {
  const count = Number(setupSnapshot?.['zone_count'])
  if (!Number.isInteger(count) || count < 1) return steps
  let changed = false
  const next = steps.map((step) => {
    if (
      canonicalOption(moduleValueAsString(step['stage_type'])) !==
      'reaction_conditions'
    ) {
      return step
    }
    const raw = moduleValueAsString(step['temperature_program'])
    if (!raw.trim()) return step
    try {
      const parsed = JSON.parse(raw) as TemperatureProgram
      const reconciled = reconcileTemperatureProgram(parsed, count)
      if (JSON.stringify(parsed) === JSON.stringify(reconciled)) return step
      changed = true
      return { ...step, temperature_program: JSON.stringify(reconciled) }
    } catch {
      return step
    }
  })
  return changed ? next : steps
}

/** §5 过程步：已选阶段的步中有必填空缺（外场组显隐依赖 §2 装置快照）。 */
function processStepsMissing(
  steps: ModuleValues[],
  setupSnapshot: Record<string, unknown> | null,
): boolean {
  const active = steps.filter(isProcessStepActive)
  for (const primary of ['preparation', 'reaction_conditions']) {
    if (
      active.filter(
        (step) =>
          canonicalOption(moduleValueAsString(step['stage_type'])) === primary,
      ).length > 1
    ) {
      return true
    }
  }
  if (!processStepOrderIsValid(active)) return true
  const zoneCountValue = Number(setupSnapshot?.['zone_count'])
  const zoneCount =
    Number.isInteger(zoneCountValue) && zoneCountValue > 0
      ? zoneCountValue
      : null
  const allowedFieldTypes = setupFieldTypes(setupSnapshot)
  return active.some((step) => {
    if (missingProcessStepKeys(step, setupSnapshot).length > 0) return true
    try {
      buildProcessStepsPayload([step], setupSnapshot)
      const stageType = canonicalOption(moduleValueAsString(step['stage_type']))
      if (stageType === 'preparation') {
        return !preparationOperationsAreValid(
          JSON.parse(
            moduleValueAsString(step['preparation_operations']),
          ) as PreparationOperation[],
        )
      }
      if (stageType !== 'reaction_conditions') return false
      const optional = <T,>(key: string): T | null => {
        const raw = moduleValueAsString(step[key])
        return raw.trim() ? (JSON.parse(raw) as T) : null
      }
      const temperatureProgram = JSON.parse(
        moduleValueAsString(step['temperature_program']),
      ) as TemperatureProgram
      const gasFeeds = JSON.parse(
        moduleValueAsString(step['gas_feeds']),
      ) as GasFeed[]
      const durationCycles = JSON.parse(
        moduleValueAsString(step['duration_cycles']),
      ) as DurationCycles
      const fieldParams = optional<ActualField[]>('field_params') ?? []
      const duration = durationCycles.duration_min
      const timelineExceedsDuration =
        typeof duration === 'number' &&
        (temperatureProgram.zones.some((zone) =>
          zone.points.some(
            (point) =>
              typeof point.elapsed_min === 'number' &&
              point.elapsed_min > duration,
          ),
        ) ||
          gasFeeds.some((feed) =>
            feed.intervals.some(
              (interval) =>
                typeof interval.end_min === 'number' &&
                interval.end_min > duration,
            ),
          ) ||
          fieldParams.some(
            (field) =>
              typeof field.end_min === 'number' && field.end_min > duration,
          ))
      return (
        !temperatureProgramIsValid(temperatureProgram, zoneCount) ||
        !gasFeedsAreValid(gasFeeds) ||
        !durationCyclesAreValid(durationCycles) ||
        timelineExceedsDuration ||
        !measuredTemperatureIsValid(
          optional<MeasuredTemperatureReference>('measured_temperature'),
          zoneCount,
        ) ||
        !coolingParamsAreValid(optional<CoolingParams>('cooling_params')) ||
        (allowedFieldTypes.length > 0 &&
          !fieldParamsAreValid(fieldParams, allowedFieldTypes))
      )
    } catch {
      return true
    }
  })
}

type ModuleContext = {
  mode: 'new' | 'edit'
  state: ExperimentV2FormState
  runCode?: string
}

type ModuleSpec = {
  key: string
  active: (context: ModuleContext) => boolean
  missing: (context: ModuleContext) => boolean
  payload?: (context: ModuleContext) => Record<string, unknown>
}

const MODULE_SPECS: ModuleSpec[] = [
  {
    key: 'basic_info',
    active: () => true,
    missing: ({ mode, state }) =>
      mode === 'new'
        ? ESSENTIAL_RUN_KEYS.some((key) =>
            key === 'precheck_confirmed'
              ? moduleValueAsString(state.basic_info[key]) !== 'true'
              : moduleValueIsEmpty(state.basic_info[key]),
          )
        : missingRequiredKeys('basic_info', state.basic_info).length > 0,
    payload: ({ state, runCode }) => {
      const values = runCode
        ? { ...state.basic_info, run_code: runCode }
        : state.basic_info
      const payload = buildFlatModulePayload('basic_info', values)
      payload.started_at = toIsoDateTime(
        moduleValueAsString(state.basic_info['started_at']),
      )
      return payload
    },
  },
  {
    key: 'target_product',
    active: ({ state }) => targetProductActive(state),
    missing: ({ state }) =>
      targetProductMissing(state.target_product, state.components),
    payload: ({ state }) =>
      buildTargetProductPayload(state.target_product, state.components),
  },
  {
    key: 'equipment',
    active: ({ state }) =>
      Boolean(state.equipment.setupId && state.equipment.version != null),
    missing: ({ state }) =>
      !state.equipment.setupId ||
      state.equipment.version == null ||
      tubeUsageHistoryPayload(state.equipment.tubeUsageHistory) == null,
  },
  {
    key: 'precursors',
    active: ({ state }) => state.precursors.some(itemHasAnyValue),
    missing: ({ state }) => {
      const value = Number(state.equipment.snapshot?.['zone_count'])
      return itemsMissing(
        'precursors',
        state.precursors,
        Number.isInteger(value) && value > 0 ? value : null,
      )
    },
    payload: ({ state }) =>
      buildItemsModulePayload(
        'precursors',
        authoritativeItems('precursors', state.precursors),
      ),
  },
  {
    key: 'substrates',
    active: ({ state }) => state.substrates.some(itemHasAnyValue),
    missing: ({ state }) => itemsMissing('substrates', state.substrates),
    payload: ({ state }) =>
      buildItemsModulePayload(
        'substrates',
        authoritativeItems('substrates', state.substrates),
      ),
  },
  {
    key: 'process_steps',
    active: ({ state }) => state.process_steps.some(isProcessStepActive),
    missing: ({ state }) =>
      processStepsMissing(state.process_steps, state.equipment.snapshot),
    payload: ({ state }) =>
      buildProcessStepsPayload(state.process_steps, state.equipment.snapshot),
  },
  {
    key: 'process_events',
    active: ({ state }) => state.process_events.some(itemHasAnyValue),
    missing: ({ state }) =>
      itemsMissing('process_events', state.process_events),
    payload: ({ state }) =>
      buildItemsModulePayload('process_events', state.process_events),
  },
]

function saveModuleSpec(
  runId: string,
  spec: ModuleSpec,
  context: ModuleContext,
  token: string,
) {
  if (spec.key === 'equipment') {
    return setSetupReference(
      runId,
      context.state.equipment.setupId,
      context.state.equipment.version as number,
      tubeUsageHistoryPayload(
        context.state.equipment.tubeUsageHistory,
      ) as TubeUsageHistoryPayload,
      token,
    )
  }
  return upsertModule(runId, spec.key, spec.payload!(context), token)
}

export function ExperimentV2Form({
  mode,
  runId,
  initialState,
  runCode,
  processReadOnly = false,
  resultsReadOnly = false,
  onProcessDirtyChange,
}: {
  mode: 'new' | 'edit'
  runId?: string
  initialState: ExperimentV2FormState
  /** 编辑态展示的炉次编号。 */
  runCode?: string
  processReadOnly?: boolean
  resultsReadOnly?: boolean
  onProcessDirtyChange?: (dirty: boolean) => void
}) {
  const { i18n, t } = useTranslation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const queryClient = useQueryClient()

  const [state, setState] = useState<ExperimentV2FormState>(() => ({
    ...initialState,
    process_steps: reconcileProcessTemperaturePrograms(
      initialState.process_steps,
      initialState.equipment.snapshot,
    ),
  }))
  const [showErrors, setShowErrors] = useState(false)
  const [creating, setCreating] = useState(false)
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(new Set())
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<string>>(new Set())
  const [dirtyKeys, setDirtyKeys] = useState<ReadonlySet<string>>(new Set())
  const [resultsDirty, setResultsDirty] = useState(false)
  const revisions = useRef<Record<string, number>>({})
  const [moduleErrors, setModuleErrors] = useState<
    Record<string, string | null>
  >({})

  useEffect(() => {
    onProcessDirtyChange?.(dirtyKeys.size > 0)
  }, [dirtyKeys, onProcessDirtyChange])

  const markDirty = (moduleKey: string) => {
    revisions.current[moduleKey] = (revisions.current[moduleKey] ?? 0) + 1
    setDirtyKeys((prev) => new Set(prev).add(moduleKey))
    setSavedKeys((prev) => {
      if (!prev.has(moduleKey)) return prev
      const next = new Set(prev)
      next.delete(moduleKey)
      return next
    })
    setModuleErrors((prev) =>
      prev[moduleKey] ? { ...prev, [moduleKey]: null } : prev,
    )
  }

  const setBasicInfo = (key: string, value: ModuleFieldValue) => {
    markDirty('basic_info')
    setState((prev) => ({
      ...prev,
      basic_info: { ...prev.basic_info, [key]: value },
    }))
  }
  const setTargetProduct = (key: string, value: ModuleFieldValue) => {
    markDirty('target_product')
    setState((prev) => ({
      ...prev,
      target_product: { ...prev.target_product, [key]: value },
    }))
  }
  const setComponents = (rows: ComponentRow[]) => {
    markDirty('target_product')
    setState((prev) => ({ ...prev, components: rows }))
  }
  const setPrecursors = (items: ModuleValues[]) => {
    markDirty('precursors')
    setState((prev) => ({ ...prev, precursors: items }))
  }
  const setSubstrates = (items: ModuleValues[]) => {
    markDirty('substrates')
    setState((prev) => ({ ...prev, substrates: items }))
  }
  const selectSetup = (entityId: string, entity: V2EntityRead | null) => {
    const snapshot = entity?.latest_version?.data ?? null
    const processSteps = reconcileProcessTemperaturePrograms(
      state.process_steps,
      snapshot,
    )
    const setupSemanticsChanged =
      Number(state.equipment.snapshot?.['zone_count']) !==
        Number(snapshot?.['zone_count']) ||
      JSON.stringify(state.equipment.snapshot?.['field_devices'] ?? []) !==
        JSON.stringify(snapshot?.['field_devices'] ?? [])
    markDirty('equipment')
    if (
      processSteps !== state.process_steps ||
      (setupSemanticsChanged && state.process_steps.some(isProcessStepActive))
    ) {
      markDirty('process_steps')
    }
    if (setupSemanticsChanged && state.precursors.some(itemHasAnyValue)) {
      markDirty('precursors')
    }
    if (setupSemanticsChanged && state.substrates.some(itemHasAnyValue)) {
      markDirty('substrates')
    }
    setState((prev) => ({
      ...prev,
      equipment: {
        setupId: entityId,
        version: entity?.latest_version?.version ?? null,
        snapshot,
        tubeUsageHistory:
          entityId === prev.equipment.setupId
            ? prev.equipment.tubeUsageHistory
            : '',
      },
      process_steps:
        processSteps === state.process_steps
          ? prev.process_steps
          : processSteps,
    }))
  }
  const setTubeUsageHistory = (value: string) => {
    markDirty('equipment')
    setState((prev) => ({
      ...prev,
      equipment: { ...prev.equipment, tubeUsageHistory: value },
    }))
  }
  const setProcessSteps = (steps: ModuleValues[]) => {
    markDirty('process_steps')
    setState((prev) => ({ ...prev, process_steps: steps }))
  }
  const setProcessEvents = (items: ModuleValues[]) => {
    markDirty('process_events')
    setState((prev) => ({ ...prev, process_events: items }))
  }
  const buildRunCreatePayload = (): V2ExperimentCreate => ({
    started_at: toIsoDateTime(
      moduleValueAsString(state.basic_info['started_at']),
    ),
    synthesis_method: moduleValueAsString(
      state.basic_info['synthesis_method'],
    ).trim(),
    ambient_temperature_C: Number(
      moduleValueAsString(state.basic_info['ambient_temperature_C']),
    ),
    ambient_humidity_percent: Number(
      moduleValueAsString(state.basic_info['ambient_humidity_percent']),
    ),
    precheck_confirmed:
      moduleValueAsString(state.basic_info['precheck_confirmed']) === 'true',
  })

  const moduleContext = (
    formMode: 'new' | 'edit',
    createdRunCode?: string,
  ) => ({
    mode: formMode,
    state,
    runCode: createdRunCode ?? (formMode === 'edit' ? runCode : undefined),
  })

  // ── 编辑态：分模块保存 ──
  const saveModule = async (moduleKey: string) => {
    if (!runId) return
    const spec = MODULE_SPECS.find((item) => item.key === moduleKey)
    if (!spec) return
    const context = moduleContext('edit')
    if (spec.missing(context)) {
      setShowErrors(true)
      toast.error(
        t(
          moduleKey === 'equipment' && !state.equipment.setupId
            ? 'experimentsV2.form.selectSetupFirst'
            : moduleKey === 'equipment'
              ? 'validation.usageHistory'
              : 'experimentsV2.form.fixRequired',
        ),
      )
      return
    }

    const revision = revisions.current[moduleKey] ?? 0
    setSavingKeys((prev) => new Set(prev).add(moduleKey))
    try {
      const response = await saveModuleSpec(runId, spec, context, token)
      queryClient.setQueryData(
        ['v2-experiment', runId, token],
        (
          cached:
            | { run: V2ExperimentRead; modules: Record<string, unknown> }
            | undefined,
        ) =>
          cached
            ? spec.key === 'equipment'
              ? { ...cached, run: response as V2ExperimentRead }
              : {
                  ...cached,
                  modules: { ...cached.modules, [moduleKey]: response },
                }
            : cached,
      )
      void queryClient.invalidateQueries({
        queryKey: ['v2-run-audit', runId],
      })
      if ((revisions.current[moduleKey] ?? 0) === revision) {
        setDirtyKeys((prev) => {
          const next = new Set(prev)
          next.delete(moduleKey)
          return next
        })
        setSavedKeys((prev) => new Set(prev).add(moduleKey))
      }
      toast.success(t('experimentsV2.form.moduleSaveSuccess'))
    } catch (error) {
      const invalid =
        error instanceof HttpError && error.status === 422
          ? (
              error.payload as {
                detail?: { invalid?: Array<{ key: string; reason: string }> }
              }
            )?.detail?.invalid
          : undefined
      const labels = invalid
        ?.map(({ key }) =>
          MODULE_SPECS.flatMap(({ key: module }) =>
            getModuleFields(module),
          ).find((field) => field.key === key),
        )
        .filter((field) => field != null)
        .map((field) => localizedFieldLabel(field, i18n.language))
      const message = labels?.length
        ? t('experimentsV2.form.invalidFields', { fields: labels.join('、') })
        : resolveErrorMessage(error, t('experimentsV2.form.saveError'))
      setModuleErrors((prev) => ({ ...prev, [moduleKey]: message }))
      toast.error(message)
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev)
        next.delete(moduleKey)
        return next
      })
    }
  }

  // ── 新建态：只创建基本记录；其余工艺在详情页分节保存 ──
  const createAndSave = async () => {
    const blocked = MODULE_SPECS[0].missing(moduleContext('new'))
    if (blocked) {
      setShowErrors(true)
      toast.error(t('experimentsV2.form.fixRequired'))
      return
    }

    setCreating(true)
    try {
      const created: V2ExperimentRead = await createRun(
        buildRunCreatePayload(),
        token,
      )
      toast.success(t('experimentsV2.form.createSuccess'))
      await navigate({
        to: '/experiments/$runId/edit',
        params: { runId: created.id },
      })
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, t('experimentsV2.form.createError')),
      )
    } finally {
      setCreating(false)
    }
  }

  const saveProps = (moduleKey: string): ModuleSaveProps | undefined =>
    mode === 'edit'
      ? {
          onSave: () => void saveModule(moduleKey),
          saving: savingKeys.has(moduleKey),
          saved: savedKeys.has(moduleKey),
          error: moduleErrors[moduleKey] ?? null,
        }
      : undefined
  const setupZoneCountValue = Number(state.equipment.snapshot?.['zone_count'])
  const setupZoneCount =
    Number.isInteger(setupZoneCountValue) && setupZoneCountValue > 0
      ? setupZoneCountValue
      : null

  return (
    <div
      className={cn(
        'flex flex-col gap-6',
        mode === 'edit' &&
          'xl:grid xl:grid-cols-[minmax(0,1fr)_15rem] xl:items-start',
      )}
    >
      <RouteLeaveGuard
        when={shouldBlockExperimentLeave(
          dirtyKeys.size + Number(resultsDirty),
          creating,
        )}
        message={t('experimentsV2.form.leaveWarning')}
      />
      <div className="flex min-w-0 flex-col gap-6">
        {mode === 'edit' ? (
          <p className="text-xs text-muted-foreground xl:hidden">
            {t('experimentsV2.form.requiredHint')}
          </p>
        ) : null}
        <fieldset disabled={processReadOnly} className="contents">
          <BasicInfoSection
            values={state.basic_info}
            onChange={setBasicInfo}
            disabled={creating}
            showErrors={showErrors}
            save={saveProps('basic_info')}
            editMode={mode === 'edit'}
            footer={
              mode === 'new' ? (
                <Button
                  type="button"
                  disabled={creating}
                  onClick={() => void createAndSave()}
                >
                  {creating ? (
                    <Loader2
                      data-icon="inline-start"
                      className="animate-spin"
                    />
                  ) : null}
                  {t('experimentsV2.form.createAction')}
                </Button>
              ) : undefined
            }
          />
          {mode === 'edit' ? (
            <>
              <TargetProductSection
                values={state.target_product}
                onChange={setTargetProduct}
                components={state.components}
                onComponentsChange={setComponents}
                disabled={creating}
                showErrors={showErrors}
                save={saveProps('target_product')}
              />
              <EquipmentSection
                equipment={state.equipment}
                onSelectSetup={selectSetup}
                onTubeUsageHistoryChange={setTubeUsageHistory}
                disabled={creating}
                showErrors={showErrors}
                save={saveProps('equipment')}
              />
              <RepeatableItemsSection
                moduleKey="precursors"
                index="§3"
                title={t('experimentsV2.sections.precursors.title')}
                addLabel={t('experimentsV2.sections.precursors.add')}
                emptyHint={t('experimentsV2.sections.precursors.empty')}
                itemLabel={(position) =>
                  t('experimentsV2.sections.precursors.item', { position })
                }
                items={state.precursors}
                onItemsChange={setPrecursors}
                disabled={creating}
                showErrors={showErrors}
                save={saveProps('precursors')}
                zoneCount={setupZoneCount}
              />
              <RepeatableItemsSection
                moduleKey="substrates"
                index="§4"
                title={t('experimentsV2.sections.substrates.title')}
                addLabel={t('experimentsV2.sections.substrates.add')}
                emptyHint={t('experimentsV2.sections.substrates.empty')}
                itemLabel={(position) =>
                  t('experimentsV2.sections.substrates.item', { position })
                }
                items={state.substrates}
                onItemsChange={setSubstrates}
                disabled={creating}
                showErrors={showErrors}
                save={saveProps('substrates')}
                zoneCount={setupZoneCount}
              />
              <ProcessStepsSection
                runId={runId ?? ''}
                steps={state.process_steps}
                setupSnapshot={state.equipment.snapshot}
                onStepsChange={setProcessSteps}
                disabled={creating}
                showErrors={showErrors}
                save={saveProps('process_steps')}
              />
              <RepeatableItemsSection
                moduleKey="process_events"
                runId={runId}
                index="§6"
                title={t('experimentsV2.sections.processEvents.title')}
                addLabel={t('experimentsV2.sections.processEvents.add')}
                emptyHint={t('experimentsV2.sections.processEvents.empty')}
                itemLabel={(position) =>
                  t('experimentsV2.sections.processEvents.item', { position })
                }
                items={state.process_events}
                onItemsChange={setProcessEvents}
                disabled={creating}
                showErrors={showErrors}
                save={saveProps('process_events')}
              />
            </>
          ) : null}
        </fieldset>
        {mode === 'edit' ? (
          <ResultsSection
            runId={runId}
            readOnly={resultsReadOnly}
            onDirtyChange={setResultsDirty}
          />
        ) : null}
      </div>
      {mode === 'edit' ? (
        <Card className="sticky top-[84px] hidden xl:block">
          <CardHeader>
            <CardTitle>{t('experimentsV2.form.sectionNavigation')}</CardTitle>
            <CardDescription>
              {t('experimentsV2.form.requiredHint')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <nav
              aria-label={t('experimentsV2.form.sectionNavigation')}
              className="flex flex-col gap-1"
            >
              {FORM_SECTION_LINKS.map((section) => (
                <Button
                  key={section.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  asChild
                >
                  <a href={`#${section.id}`}>
                    <span className="w-7 shrink-0 text-xs text-muted-foreground">
                      {section.index}
                    </span>
                    <span className="truncate">
                      {t(`experimentsV2.sections.${section.titleKey}.title`)}
                    </span>
                  </a>
                </Button>
              ))}
            </nav>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
