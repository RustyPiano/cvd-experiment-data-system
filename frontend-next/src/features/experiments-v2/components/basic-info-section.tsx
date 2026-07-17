// 基本信息：元数据驱动。PVD 方法暂不在用户界面开放。
import { useTranslation } from 'react-i18next'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import type { ModuleValues } from '../field-logic'
import {
  getModuleFields,
  isFieldVisible,
  parseEnumOptions,
} from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { FieldControl } from './field-control'
import { ModuleCard } from './module-card'

function unsupportedSynthesisMethods(field: FieldMetadata) {
  if (field.key !== 'synthesis_method') return undefined
  return parseEnumOptions(field.input, field.options)?.filter(
    (option) => option.startsWith('PVD') || option === 'PLD',
  )
}

export function BasicInfoSection({
  values,
  onChange,
  disabled,
  showErrors,
  save,
  editMode = false,
}: {
  values: ModuleValues
  onChange: (key: string, value: string) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
  editMode?: boolean
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
              readOnly={editMode && field.key === 'run_code'}
              hint={
                field.key === 'run_code'
                  ? t(
                      editMode
                        ? 'experimentsV2.form.runCodeLocked'
                        : 'experimentsV2.form.runCodePattern',
                    )
                  : undefined
              }
              pattern={
                field.key === 'run_code' && !editMode
                  ? '^CVD-\\d{4}-\\d{4}$'
                  : undefined
              }
              hiddenOptions={unsupportedSynthesisMethods(field)}
              showError={showErrors}
            />
          ))}
      </div>
    </ModuleCard>
  )
}
