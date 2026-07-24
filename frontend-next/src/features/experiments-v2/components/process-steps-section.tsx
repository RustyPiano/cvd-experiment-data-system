// §5 过程步（D11 数据驱动核心）：可重复过程步，每步先选『阶段类型』，随后只显示该阶段
// stageTypes.shows 对应参数组字段（common 恒显）。降温组仅『降温』出现且条件必填、反应生长
// 压力体系必填、外场组仅当 §2 已选 Setup 且快照 field_devices≠无 时出现（跨实体条件）。
// 步序可上下移动；payload 形状对齐后端 discriminated union（stage_type + 该阶段允许键）。
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { ModuleFieldValue, ModuleValues } from '../field-logic'
import {
  emptyModuleValues,
  getModuleFields,
  isProcessStepFieldRequired,
  isProcessStepFieldVisible,
  moduleValueAsString,
} from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { FieldControl } from './field-control'
import { ModuleCard } from './module-card'

const STAGE_TYPE_KEY = 'stage_type'

export function ProcessStepsSection({
  steps,
  setupSnapshot,
  onStepsChange,
  disabled,
  showErrors,
  save,
}: {
  steps: ModuleValues[]
  /** §2 被引用装置版本快照（读 field_devices 判外场组显隐）。 */
  setupSnapshot: Record<string, unknown> | null
  onStepsChange: (steps: ModuleValues[]) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
}) {
  const { t } = useTranslation()
  const fields = getModuleFields('process_steps')
  const stageTypeField = fields.find((field) => field.key === STAGE_TYPE_KEY)

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
  const addStep = () =>
    onStepsChange([...steps, emptyModuleValues('process_steps')])
  const removeStep = (stepIndex: number) =>
    onStepsChange(steps.filter((_, i) => i !== stepIndex))
  const moveStep = (stepIndex: number, delta: number) => {
    const target = stepIndex + delta
    if (target < 0 || target >= steps.length) return
    const next = [...steps]
    ;[next[stepIndex], next[target]] = [next[target], next[stepIndex]]
    onStepsChange(next)
  }

  return (
    <ModuleCard
      id="module-process_steps"
      index="§5"
      title={t('experimentsV2.sections.processSteps.title')}
      subtitle={t('experimentsV2.sections.processSteps.subtitle')}
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
          return (
            <div
              key={stepIndex}
              className="rounded-md border border-border p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {t('experimentsV2.sections.processSteps.item', {
                    position: stepIndex + 1,
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || stepIndex === 0}
                    aria-label={t('experimentsV2.sections.processSteps.moveUp')}
                    onClick={() => moveStep(stepIndex, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled || stepIndex === steps.length - 1}
                    aria-label={t(
                      'experimentsV2.sections.processSteps.moveDown',
                    )}
                    onClick={() => moveStep(stepIndex, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={t('experimentsV2.form.removeItem')}
                    onClick={() => removeStep(stepIndex)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>

              {stageTypeField ? (
                <FieldControl
                  moduleKey="process_steps"
                  field={stageTypeField}
                  values={step}
                  value={stageType}
                  onChange={(value) =>
                    setStepValue(stepIndex, STAGE_TYPE_KEY, value)
                  }
                  disabled={disabled}
                  showError={showErrors && Boolean(stageType)}
                  requiredOverride
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
                    .map((field) => (
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
                        requiredOverride={isProcessStepFieldRequired(
                          field,
                          stageType,
                          setupSnapshot,
                          step,
                        )}
                      />
                    ))}
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
          <Plus className="size-4" />
          {t('experimentsV2.sections.processSteps.add')}
        </Button>
      </div>
    </ModuleCard>
  )
}
