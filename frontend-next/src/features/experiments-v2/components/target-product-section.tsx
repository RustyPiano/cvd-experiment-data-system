// §1b 目标产物：结构类型下拉（判别器）驱动 components[] 编辑器条件必填；
// 化学式带元素校验；显示串预览复刻后端 formula_display 规则。
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ComponentRow,
  ModuleFieldValue,
  ModuleValues,
} from '../field-logic'
import {
  getModuleFields,
  isEffectivelyRequired,
  isFieldVisible,
  isNonEmptyComponent,
  moduleValueAsString,
  structureGuideKey,
} from '../field-logic'
import type { ModuleSaveProps } from '../form-types'
import { renderFormulaDisplay } from '../formula'
import { FieldControl } from './field-control'
import { FieldLabel } from './field-bits'
import { ComponentsEditor } from './components-editor'
import { ModuleCard } from './module-card'
import { localizedFieldLabel, localizedUnit } from '@/shared/field-i18n'

export function TargetProductSection({
  values,
  onChange,
  components,
  onComponentsChange,
  disabled,
  showErrors,
  save,
}: {
  values: ModuleValues
  onChange: (key: string, value: ModuleFieldValue) => void
  components: ComponentRow[]
  onComponentsChange: (rows: ComponentRow[]) => void
  disabled?: boolean
  showErrors?: boolean
  save?: ModuleSaveProps
}) {
  const { i18n, t } = useTranslation()
  const fields = getModuleFields('target_product')
  const componentsField = fields.find((field) => field.key === 'components')
  const structureType = moduleValueAsString(values['structure_type'])
  const showComponents =
    componentsField != null &&
    isFieldVisible('target_product', componentsField, values)
  const componentsRequired =
    componentsField != null &&
    isEffectivelyRequired('target_product', componentsField, values)
  const componentsMissing =
    Boolean(showErrors) &&
    componentsRequired &&
    !components.some(isNonEmptyComponent)
  const guide = structureGuideKey(structureType)

  const displayPreview = useMemo(() => {
    const chemicalFormula = moduleValueAsString(values['chemical_formula'])
    return renderFormulaDisplay(
      chemicalFormula,
      structureType,
      components.filter(isNonEmptyComponent),
    )
  }, [values, structureType, components])

  return (
    <ModuleCard
      index="§1b"
      title={t('experimentsV2.sections.targetProduct.title')}
      subtitle={t('experimentsV2.sections.targetProduct.subtitle')}
      onSave={save?.onSave}
      saving={save?.saving}
      saved={save?.saved}
      error={save?.error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {[...fields]
          .sort(
            (a, b) =>
              Number(b.key === 'structure_type') -
              Number(a.key === 'structure_type'),
          )
          .filter((field) => field.key !== 'components')
          .filter((field) => isFieldVisible('target_product', field, values))
          .map((field) => (
            <FieldControl
              key={field.key}
              moduleKey="target_product"
              field={field}
              values={values}
              value={values[field.key] ?? ''}
              onChange={(value) => onChange(field.key, value)}
              disabled={disabled}
              showError={showErrors}
            />
          ))}
      </div>

      {guide ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
          <p className="font-medium text-foreground">
            {t('experimentsV2.sections.targetProduct.guideTitle')}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(guide)}
          </p>
        </div>
      ) : null}

      {showComponents && componentsField ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3">
          <FieldLabel
            labelZh={localizedFieldLabel(componentsField, i18n.language)}
            unit={localizedUnit(componentsField.unit, i18n.language)}
            required={componentsRequired}
            r0={componentsField.r0}
          />
          <ComponentsEditor
            rows={components}
            onChange={onComponentsChange}
            disabled={disabled}
            showError={componentsMissing}
          />
        </div>
      ) : null}

      {displayPreview ? (
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <span className="text-muted-foreground">
            {t('experimentsV2.sections.targetProduct.displayPreview')}：
          </span>
          <span className="font-mono font-medium text-foreground">
            {displayPreview}
          </span>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('experimentsV2.sections.targetProduct.displayNote')}
          </p>
        </div>
      ) : null}
    </ModuleCard>
  )
}
