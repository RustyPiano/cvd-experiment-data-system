// §1 基本信息：元数据驱动。合成方法下拉是决定 §8 PVD 显隐的顶层判别器（本步先存值）。
import { useTranslation } from 'react-i18next'
import type { ModuleValues } from '../field-logic'
import { getModuleFields, isFieldVisible } from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { FieldControl } from './field-control'
import { ModuleCard } from './module-card'

export function BasicInfoSection({
  values,
  onChange,
  disabled,
  showErrors,
  save,
}: {
  values: ModuleValues
  onChange: (key: string, value: string) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
}) {
  const { t } = useTranslation()
  const fields = getModuleFields('basic_info')

  return (
    <ModuleCard
      index="§1"
      title={t('experimentsV2.sections.basicInfo.title')}
      subtitle={t('experimentsV2.sections.basicInfo.subtitle')}
      onSave={save?.onSave}
      saving={save?.saving}
      saved={save?.saved}
      error={save?.error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields
          .filter((field) => isFieldVisible('basic_info', field, values))
          .map((field) => (
            <FieldControl
              key={field.key}
              moduleKey="basic_info"
              field={field}
              values={values}
              value={values[field.key] ?? ''}
              onChange={(value) => onChange(field.key, value)}
              disabled={disabled}
              showError={showErrors}
            />
          ))}
      </div>
    </ModuleCard>
  )
}
