// §5 过程步（D11 数据驱动核心）：可重复过程步，每步先选『阶段类型』，随后只显示该阶段
// stageTypes.shows 对应参数组字段（common 恒显）。降温组仅『降温』出现且条件必填、反应生长
// 压力体系必填、外场组仅当 §2 已选 Setup 且快照 field_devices≠无 时出现（跨实体条件）。
// 步序可上下移动；payload 形状对齐后端 discriminated union（stage_type + 该阶段允许键）。
import { Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  canonicalOption,
  localizedFieldLabel,
  localizedUnit,
} from '@/shared/field-i18n'
import {
  buildCoolingParamsEditorLabels,
  buildDurationCyclesEditorLabels,
  buildFieldParamsEditorLabels,
  buildGasFeedsEditorLabels,
  buildMeasuredTemperatureEditorLabels,
  buildPreparationOperationsEditorLabels,
  buildTemperatureProgramEditorLabels,
} from '@/shared/structured-editor-labels'
import type { ModuleFieldValue, ModuleValues } from '../field-logic'
import {
  emptyModuleValues,
  getModuleFields,
  isRetiredProcessStage,
  isProcessStepFieldRequired,
  isProcessStepFieldVisible,
  moduleValueAsString,
} from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { FieldControl } from './field-control'
import { FieldLabel } from './field-bits'
import { GasFeedsEditor } from './gas-feeds-editor'
import type { GasFeed } from './gas-feeds-editor'
import { ModuleCard } from './module-card'
import {
  CoolingParamsEditor,
  DurationCyclesEditor,
  FieldParamsEditor,
  MeasuredTemperatureEditor,
  PreparationOperationsEditor,
  actualFieldTypes,
} from './process-detail-editors'
import type {
  ActualField,
  ActualFieldType,
  CoolingParams,
  DurationCycles,
  MeasuredTemperatureReference,
  PreparationOperation,
} from './process-detail-editors'
import { TemperatureProgramEditor } from './temperature-program-editor'
import type { TemperatureProgram } from './temperature-program-editor'

const STAGE_TYPE_KEY = 'stage_type'

function jsonValue<T>(value: ModuleFieldValue | undefined, fallback: T): T {
  try {
    return JSON.parse(moduleValueAsString(value) || '') as T
  } catch {
    return fallback
  }
}

export function setupFieldTypes(
  snapshot: Record<string, unknown> | null,
): ActualFieldType[] {
  const raw = snapshot?.['field_devices']
  const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw]
  return values
    .map((value) => canonicalOption(String(value)))
    .filter((value): value is ActualFieldType =>
      actualFieldTypes.includes(value as ActualFieldType),
    )
}

export function ProcessStepsSection({
  runId,
  steps,
  setupSnapshot,
  onStepsChange,
  disabled,
  showErrors,
  save,
}: {
  runId: string
  steps: ModuleValues[]
  /** §2 被引用装置版本快照（读 field_devices 判外场组显隐）。 */
  setupSnapshot: Record<string, unknown> | null
  onStepsChange: (steps: ModuleValues[]) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
}) {
  const { i18n, t } = useTranslation()
  const fields = getModuleFields('process_steps')
  const stageTypeField = fields.find((field) => field.key === STAGE_TYPE_KEY)
  const zoneCountValue = Number(setupSnapshot?.['zone_count'])
  const zoneCount =
    Number.isInteger(zoneCountValue) && zoneCountValue > 0
      ? zoneCountValue
      : null
  const allowedFieldTypes = setupFieldTypes(setupSnapshot)

  const setStepValue = (
    stepIndex: number,
    key: string,
    value: ModuleFieldValue,
  ) => {
    onStepsChange(
      steps.map((step, i) =>
        i === stepIndex ? { ...step, [key]: value } : step,
      ),
    )
  }
  const addStep = () => {
    const step = emptyModuleValues('process_steps')
    step[STAGE_TYPE_KEY] = 'other'
    onStepsChange([...steps, step])
  }
  const removeStep = (stepIndex: number) =>
    onStepsChange(steps.filter((_, i) => i !== stepIndex))
  const structuredEditor = (
    key: string,
    value: ModuleFieldValue | undefined,
    onChange: (value: string) => void,
  ) => {
    switch (key) {
      case 'preparation_operations':
        return (
          <PreparationOperationsEditor
            value={jsonValue<PreparationOperation[]>(value, [])}
            onChange={(next) => onChange(JSON.stringify(next))}
            disabled={disabled}
            showErrors={showErrors}
            labels={buildPreparationOperationsEditorLabels(t)}
          />
        )
      case 'temperature_program':
        return (
          <TemperatureProgramEditor
            value={jsonValue<TemperatureProgram>(value, { zones: [] })}
            onChange={(next) => onChange(JSON.stringify(next))}
            zoneCount={zoneCount}
            disabled={disabled}
            showErrors={showErrors}
            labels={buildTemperatureProgramEditorLabels(t)}
          />
        )
      case 'measured_temperature':
        return (
          <MeasuredTemperatureEditor
            runId={runId}
            value={jsonValue<MeasuredTemperatureReference | null>(value, null)}
            onChange={(next) => onChange(JSON.stringify(next))}
            zoneCount={zoneCount}
            disabled={disabled}
            showErrors={showErrors}
            saved={save?.saved}
            labels={buildMeasuredTemperatureEditorLabels(t)}
          />
        )
      case 'gas_feeds':
        return (
          <GasFeedsEditor
            value={jsonValue<GasFeed[]>(value, [])}
            onChange={(next) => onChange(JSON.stringify(next))}
            disabled={disabled}
            showErrors={showErrors}
            labels={buildGasFeedsEditorLabels(t)}
          />
        )
      case 'duration_cycles': {
        return (
          <DurationCyclesEditor
            value={jsonValue<DurationCycles>(value, {
              duration_min: null,
              cycle_count: null,
            })}
            onChange={(next) => onChange(JSON.stringify(next))}
            disabled={disabled}
            showErrors={showErrors}
            labels={buildDurationCyclesEditorLabels(t)}
          />
        )
      }
      case 'cooling_params':
        return (
          <CoolingParamsEditor
            value={jsonValue<CoolingParams | null>(value, null)}
            onChange={(next) => onChange(JSON.stringify(next))}
            disabled={disabled}
            showErrors={showErrors}
            labels={buildCoolingParamsEditorLabels(t)}
          />
        )
      case 'field_params':
        return (
          <FieldParamsEditor
            value={jsonValue<ActualField[]>(value, [])}
            onChange={(next) => onChange(JSON.stringify(next))}
            allowedTypes={allowedFieldTypes}
            disabled={disabled}
            showErrors={showErrors}
            labels={buildFieldParamsEditorLabels(t)}
          />
        )
      default:
        return null
    }
  }

  return (
    <ModuleCard
      id="module-process_steps"
      index="§5"
      title={t('experimentsV2.sections.processSteps.title')}
      onSave={save?.onSave}
      saving={save?.saving}
      saved={save?.saved}
      error={save?.error}
    >
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('experimentsV2.sections.processSteps.empty')}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {steps.map((step, stepIndex) => {
          const stageType = moduleValueAsString(step[STAGE_TYPE_KEY])
          const canonicalStage = canonicalOption(stageType)
          const isLegacyStage = isRetiredProcessStage(stageType)
          return (
            <div
              key={stepIndex}
              className="rounded-md border border-border p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {t(
                    canonicalStage === 'preparation'
                      ? 'experimentsV2.sections.processSteps.preparation'
                      : canonicalStage === 'reaction_conditions'
                        ? 'experimentsV2.sections.processSteps.reaction'
                        : 'experimentsV2.sections.processSteps.other',
                    { position: stepIndex - 1 },
                  )}
                </span>
                {canonicalStage === 'other' || isLegacyStage ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={t('experimentsV2.form.removeItem')}
                    onClick={() => removeStep(stepIndex)}
                  >
                    <Trash2 />
                  </Button>
                ) : null}
              </div>

              {isLegacyStage ? (
                <Alert variant="destructive" className="mb-4">
                  <TriangleAlert />
                  <AlertTitle>
                    {t('experimentsV2.sections.processSteps.legacyStageTitle')}
                  </AlertTitle>
                  <AlertDescription>
                    {t(
                      'experimentsV2.sections.processSteps.legacyStageDescription',
                    )}
                  </AlertDescription>
                </Alert>
              ) : null}

              {isLegacyStage && stageTypeField ? (
                <FieldControl
                  moduleKey="process_steps"
                  field={stageTypeField}
                  values={step}
                  value={stageType}
                  onChange={(value) =>
                    onStepsChange(
                      steps.map((item, index) =>
                        index === stepIndex
                          ? {
                              ...emptyModuleValues('process_steps'),
                              [STAGE_TYPE_KEY]: value,
                            }
                          : item,
                      ),
                    )
                  }
                  disabled={disabled}
                  showError={showErrors}
                  requiredOverride
                  hiddenOptions={['preparation', 'reaction_conditions']}
                />
              ) : null}

              {stageType ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {fields
                    .filter((field) => field.key !== STAGE_TYPE_KEY)
                    .filter((field) =>
                      isProcessStepFieldVisible(
                        field,
                        stageType,
                        setupSnapshot,
                        step,
                      ),
                    )
                    .map((field) => {
                      const required = isProcessStepFieldRequired(
                        field,
                        stageType,
                        setupSnapshot,
                        step,
                      )
                      const editor = structuredEditor(
                        field.key,
                        step[field.key],
                        (value) => setStepValue(stepIndex, field.key, value),
                      )
                      if (editor) {
                        return (
                          <div
                            key={field.key}
                            className="flex flex-col gap-2 sm:col-span-2"
                          >
                            <FieldLabel
                              labelZh={localizedFieldLabel(
                                field,
                                i18n.language,
                              )}
                              unit={localizedUnit(field.unit, i18n.language)}
                              required={required}
                              r0={field.r0}
                            />
                            {editor}
                          </div>
                        )
                      }
                      return (
                        <FieldControl
                          key={field.key}
                          moduleKey="process_steps"
                          field={field}
                          values={step}
                          value={step[field.key] ?? ''}
                          onChange={(value) =>
                            setStepValue(stepIndex, field.key, value)
                          }
                          disabled={disabled}
                          showError={showErrors}
                          requiredOverride={required}
                        />
                      )
                    })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <Separator />
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={addStep}
        >
          <Plus data-icon="inline-start" />
          {t('experimentsV2.sections.processSteps.add')}
        </Button>
      </div>
    </ModuleCard>
  )
}
