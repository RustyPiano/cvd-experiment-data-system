// 基本信息：元数据驱动。PVD 方法暂不在用户界面开放。
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModuleFieldValue, ModuleValues } from '../field-logic'
import { getModuleFields, isFieldVisible } from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { FieldControl } from './field-control'
import { ModuleCard } from './module-card'

const NEW_RUN_FIELDS = new Set([
  'started_at',
  'synthesis_method',
  'operator',
  'ambient_temperature_C',
  'ambient_humidity_percent',
  'precheck_confirmed',
])

export function BasicInfoSection({
  values,
  onChange,
  disabled,
  showErrors,
  save,
  editMode = false,
  footer,
}: {
  values: ModuleValues
  onChange: (key: string, value: ModuleFieldValue) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
  editMode?: boolean
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const fields = getModuleFields('basic_info')

  return (
    <ModuleCard
      id="module-basic_info"
      index="§1"
      title={t('experimentsV2.sections.basicInfo.title')}
      onSave={save?.onSave}
      saving={save?.saving}
      saved={save?.saved}
      error={save?.error}
      footer={footer}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields
          .filter((field) => isFieldVisible('basic_info', field, values))
          .filter((field) => editMode || NEW_RUN_FIELDS.has(field.key))
          .map((field) => (
            <div
              key={field.key}
              className={
                !editMode && field.key === 'operator'
                  ? 'sm:col-span-2'
                  : undefined
              }
            >
              <FieldControl
                moduleKey="basic_info"
                field={field}
                values={values}
                value={values[field.key] ?? ''}
                onChange={(value) => onChange(field.key, value)}
                disabled={disabled}
                readOnly={
                  field.key === 'run_code' ||
                  field.key === 'operator' ||
                  field.key === 'synthesis_method'
                }
                hint={
                  field.key === 'run_code'
                    ? t('experimentsV2.form.runCodeLocked')
                    : undefined
                }
                hideHelp={field.key === 'run_code'}
                showError={showErrors}
              />
            </div>
          ))}
      </div>
    </ModuleCard>
  )
}
