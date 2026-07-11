// v2 实验录入表单编排：持有整表状态，渲染 §1–§4 模块区块 + §5–§8 占位。
//  - 新建态：一个「创建并保存草稿」按钮 = 创建 run(schema_version=cvd_v2) + 逐模块 upsert，
//    随后跳转编辑页。
//  - 编辑态：每个模块区块带「保存本模块」按钮（草稿可分模块保存）。
// 提交前用与后端同判据的必填校验拦截，避免直接把 422 抛给用户。payload 键=字段 key。
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { useAuth } from '@/features/auth/use-auth'
import type { V2EntityRead } from '@/features/entity-library/api'
import { Button } from '@/components/ui/button'
import type { ComponentRow, ModuleValues } from './field-logic'
import {
  buildFlatModulePayload,
  buildItemsModulePayload,
  buildProcessStepsPayload,
  buildTargetProductPayload,
  getModuleFields,
  isEffectivelyRequired,
  isFieldVisible,
  isNonEmptyComponent,
  isProcessStepActive,
  isPvdApplicable,
  itemHasAnyValue,
  missingProcessStepKeys,
  missingPvdKeys,
  missingRequiredKeys,
} from './field-logic'
import { toIsoDateTime } from './datetime'
import { createRun, setSetupReference, upsertModule } from './api'
import type { V2ExperimentCreate, V2ExperimentRead } from './api'
import type { ExperimentV2FormState, ModuleSaveProps } from './form-types'
import { BasicInfoSection } from './components/basic-info-section'
import { TargetProductSection } from './components/target-product-section'
import { EquipmentSection } from './components/equipment-section'
import { RepeatableItemsSection } from './components/repeatable-items-section'
import { ProcessStepsSection } from './components/process-steps-section'
import { PvdSection } from './components/pvd-section'
import { ResultsSection } from './components/results-section'

const ESSENTIAL_RUN_KEYS = ['started_at', 'synthesis_method', 'operator']

function targetProductActive(state: ExperimentV2FormState): boolean {
  const hasFlat = Object.entries(state.target_product).some(
    ([key, value]) => key !== 'components' && value.trim() !== '',
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
      (values[field.key] ?? '').trim() === ''
    ) {
      return true
    }
  }
  return false
}

function itemsMissing(moduleKey: string, items: ModuleValues[]): boolean {
  return items
    .filter(itemHasAnyValue)
    .some((item) => missingRequiredKeys(moduleKey, item).length > 0)
}

/** §5 过程步：已选阶段的步中有必填空缺（外场组显隐依赖 §2 装置快照）。 */
function processStepsMissing(
  steps: ModuleValues[],
  setupSnapshot: Record<string, unknown> | null,
): boolean {
  return steps
    .filter(isProcessStepActive)
    .some((step) => missingProcessStepKeys(step, setupSnapshot).length > 0)
}

type ModuleContext = {
  mode: 'new' | 'edit'
  state: ExperimentV2FormState
  synthesisMethod: string
  pvdApplicable: boolean
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
        ? ESSENTIAL_RUN_KEYS.some(
            (key) => (state.basic_info[key] ?? '').trim() === '',
          )
        : missingRequiredKeys('basic_info', state.basic_info).length > 0,
    payload: ({ state, runCode }) => {
      const values = runCode
        ? { ...state.basic_info, run_code: runCode }
        : state.basic_info
      const payload = buildFlatModulePayload('basic_info', values)
      payload.started_at = toIsoDateTime(state.basic_info['started_at'] ?? '')
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
      !state.equipment.setupId || state.equipment.version == null,
  },
  {
    key: 'precursors',
    active: ({ state }) => state.precursors.some(itemHasAnyValue),
    missing: ({ state }) => itemsMissing('precursors', state.precursors),
    payload: ({ state }) =>
      buildItemsModulePayload('precursors', state.precursors),
  },
  {
    key: 'substrates',
    active: ({ state }) => state.substrates.some(itemHasAnyValue),
    missing: ({ state }) => itemsMissing('substrates', state.substrates),
    payload: ({ state }) =>
      buildItemsModulePayload('substrates', state.substrates),
  },
  {
    key: 'process_steps',
    active: ({ state }) => state.process_steps.some(isProcessStepActive),
    missing: ({ state }) =>
      processStepsMissing(state.process_steps, state.equipment.snapshot),
    payload: ({ state }) => buildProcessStepsPayload(state.process_steps),
  },
  {
    key: 'process_events',
    active: ({ state }) => state.process_events.some(itemHasAnyValue),
    missing: () => false,
    payload: ({ state }) =>
      buildItemsModulePayload('process_events', state.process_events),
  },
  {
    key: 'pvd',
    active: ({ state, pvdApplicable }) =>
      pvdApplicable && itemHasAnyValue(state.pvd),
    missing: ({ state, synthesisMethod }) =>
      missingPvdKeys(state.pvd, synthesisMethod).length > 0,
    payload: ({ state }) => buildFlatModulePayload('pvd', state.pvd),
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
  readOnly = false,
}: {
  mode: 'new' | 'edit'
  runId?: string
  initialState: ExperimentV2FormState
  /** 编辑态展示的炉次编号。 */
  runCode?: string
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session } = useAuth()
  const token = session.accessToken || ''

  const [state, setState] = useState<ExperimentV2FormState>(initialState)
  const [showErrors, setShowErrors] = useState(false)
  const [creating, setCreating] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKeys, setSavedKeys] = useState<ReadonlySet<string>>(new Set())
  const [moduleErrors, setModuleErrors] = useState<
    Record<string, string | null>
  >({})

  const markDirty = (moduleKey: string) => {
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

  const setBasicInfo = (key: string, value: string) => {
    markDirty('basic_info')
    setState((prev) => ({
      ...prev,
      basic_info: { ...prev.basic_info, [key]: value },
    }))
  }
  const setTargetProduct = (key: string, value: string) => {
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
    markDirty('equipment')
    setState((prev) => ({
      ...prev,
      equipment: {
        setupId: entityId,
        version: entity?.latest_version?.version ?? null,
        snapshot: entity?.latest_version?.data ?? null,
      },
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
  const setPvd = (key: string, value: string) => {
    markDirty('pvd')
    setState((prev) => ({ ...prev, pvd: { ...prev.pvd, [key]: value } }))
  }

  const synthesisMethod = state.basic_info['synthesis_method'] ?? ''
  const pvdApplicable = isPvdApplicable(synthesisMethod)

  const buildRunCreatePayload = (): V2ExperimentCreate => ({
    started_at: toIsoDateTime(state.basic_info['started_at'] ?? ''),
    synthesis_method: (state.basic_info['synthesis_method'] ?? '').trim(),
    operator: (state.basic_info['operator'] ?? '').trim(),
    run_code: (state.basic_info['run_code'] ?? '').trim() || undefined,
    chemical_formula:
      (state.target_product['chemical_formula'] ?? '').trim() || undefined,
  })

  const moduleContext = (formMode: 'new' | 'edit', createdRunCode?: string) => ({
    mode: formMode,
    state,
    synthesisMethod,
    pvdApplicable,
    runCode: createdRunCode,
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
          moduleKey === 'equipment'
            ? 'experimentsV2.form.selectSetupFirst'
            : 'experimentsV2.form.fixRequired',
        ),
      )
      return
    }

    setSavingKey(moduleKey)
    try {
      await saveModuleSpec(runId, spec, context, token)
      setSavedKeys((prev) => new Set(prev).add(moduleKey))
      toast.success(t('experimentsV2.form.moduleSaveSuccess'))
    } catch (error) {
      const message = resolveErrorMessage(
        error,
        t('experimentsV2.form.saveError'),
      )
      setModuleErrors((prev) => ({ ...prev, [moduleKey]: message }))
      toast.error(message)
    } finally {
      setSavingKey(null)
    }
  }

  // ── 新建态：创建 run + 逐模块 upsert，然后跳转编辑页 ──
  const createAndSave = async () => {
    const createContext = moduleContext('new')
    const blocked = MODULE_SPECS.some(
      (spec) => spec.active(createContext) && spec.missing(createContext),
    )
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
      const saveContext = moduleContext('new', created.run_code)
      for (const spec of MODULE_SPECS) {
        if (spec.active(saveContext)) {
          await saveModuleSpec(created.id, spec, saveContext, token)
        }
      }
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
          saving: savingKey === moduleKey,
          saved: savedKeys.has(moduleKey),
          error: moduleErrors[moduleKey] ?? null,
        }
      : undefined

  return (
    <fieldset disabled={readOnly} className="flex flex-col gap-6">
      {mode === 'edit' && runCode ? (
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.form.editingRun', { runCode })}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('experimentsV2.form.requiredHint')}
      </p>

      <BasicInfoSection
        values={state.basic_info}
        onChange={setBasicInfo}
        disabled={creating}
        showErrors={showErrors}
        save={saveProps('basic_info')}
      />
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
        disabled={creating}
        showErrors={showErrors}
        save={saveProps('equipment')}
      />
      <RepeatableItemsSection
        moduleKey="precursors"
        index="§3"
        title={t('experimentsV2.sections.precursors.title')}
        subtitle={t('experimentsV2.sections.precursors.subtitle')}
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
      />
      <RepeatableItemsSection
        moduleKey="substrates"
        index="§4"
        title={t('experimentsV2.sections.substrates.title')}
        subtitle={t('experimentsV2.sections.substrates.subtitle')}
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
      />

      <ProcessStepsSection
        steps={state.process_steps}
        setupSnapshot={state.equipment.snapshot}
        onStepsChange={setProcessSteps}
        disabled={creating}
        showErrors={showErrors}
        save={saveProps('process_steps')}
      />
      <RepeatableItemsSection
        moduleKey="process_events"
        index="§6"
        title={t('experimentsV2.sections.processEvents.title')}
        subtitle={t('experimentsV2.sections.processEvents.subtitle')}
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
      <ResultsSection runId={runId} />
      {pvdApplicable ? (
        <PvdSection
          synthesisMethod={synthesisMethod}
          values={state.pvd}
          onChange={setPvd}
          disabled={creating}
          showErrors={showErrors}
          save={saveProps('pvd')}
        />
      ) : null}

      {mode === 'new' ? (
        <div className="flex justify-end">
          <Button
            type="button"
            disabled={creating}
            onClick={() => void createAndSave()}
          >
            {creating ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('experimentsV2.form.createAction')}
          </Button>
        </div>
      ) : null}
    </fieldset>
  )
}
