// §8 PVD：仅当 §1 合成方法 ∈ PVD 体系（PVD-磁控溅射/PVD-热蒸发/PLD，判别器已在 3a 存值）
// 时显示。字段元数据驱动，条件必填(PVD)。靶材（批次）走物料批次引用选择器。整段显隐与
// 字段必填均由 §1 合成方法判定（isPvdApplicable/isPvdFieldRequired）。
import { useTranslation } from 'react-i18next'
import type { ModuleValues } from '../field-logic'
import { getModuleFields, isPvdFieldRequired } from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { FieldControl } from './field-control'
import { FieldLabel } from './field-bits'
import { EntityReferenceSelect } from './entity-reference-select'
import { ModuleCard } from './module-card'

const TARGET_LOT_KEY = 'target_lot_ref'

export function PvdSection({
  synthesisMethod,
  values,
  onChange,
  disabled,
  showErrors,
  save,
}: {
  /** §1 合成方法（决定字段条件必填；本段仅在 PVD 适用时挂载）。 */
  synthesisMethod: string
  values: ModuleValues
  onChange: (key: string, value: string) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
}) {
  const { t } = useTranslation()
  const fields = getModuleFields('pvd')

  return (
    <ModuleCard
      index="§8"
      title={t('experimentsV2.sections.pvd.title')}
      subtitle={t('experimentsV2.sections.pvd.subtitle')}
      onSave={save?.onSave}
      saving={save?.saving}
      saved={save?.saved}
      error={save?.error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => {
          const required = isPvdFieldRequired(field, synthesisMethod)
          if (field.key === TARGET_LOT_KEY) {
            const value = values[field.key] ?? ''
            const missing = Boolean(showErrors) && required && value === ''
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <FieldLabel
                  labelZh={field.labelZh}
                  unit={field.unit}
                  required={required}
                  r0={field.r0}
                />
                <EntityReferenceSelect
                  kind="material_lot"
                  value={value}
                  onChange={(entityId) => onChange(field.key, entityId)}
                  disabled={disabled}
                />
                {missing ? (
                  <p className="text-xs text-destructive">
                    {t('validation.required')}
                  </p>
                ) : null}
              </div>
            )
          }
          return (
            <FieldControl
              key={field.key}
              moduleKey="pvd"
              field={field}
              values={values}
              value={values[field.key] ?? ''}
              onChange={(value) => onChange(field.key, value)}
              disabled={disabled}
              showError={showErrors}
              requiredOverride={required}
            />
          )
        })}
      </div>
    </ModuleCard>
  )
}
