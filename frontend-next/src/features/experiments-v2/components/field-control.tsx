// 元数据驱动的单字段控件：标签（含单位/必填红星）+ 控件（下拉 / 多行 / 文本 /
// 化学式）。必填与显隐由 field-logic 计算。文案走 i18n。
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import {
  localizedFieldHelp,
  localizedFieldLabel,
  localizedFieldPlaceholder,
  localizedOption,
  localizedUnit,
} from '@/shared/field-i18n'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  isCompositeInput,
  parseCompositeOptions,
} from '@/shared/composite-field'
import { CompositeFieldControl } from '@/shared/ui/composite-field-control'
import type { ModuleValues } from '../field-logic'
import { isEffectivelyRequired, parseEnumOptions } from '../field-logic'
import { FieldLabel } from './field-bits'
import { FormulaInput } from './formula-input'

// 跨模块用多行输入的字段键（长文本/描述/清单）。
const TEXTAREA_KEYS = new Set([
  'precheck_reminder',
  'note',
  'setup_diagram',
  'target_performance',
  'treatment_steps',
  'pretreatment_steps',
  'coordinate_system',
])

// 用化学式元素校验控件的字段键（§1b 化学体系/化学式）。
const FORMULA_KEYS = new Set(['chemical_formula'])

// 用 datetime-local 控件的字段键（§1 实验时间）。
const DATETIME_KEYS = new Set(['started_at'])

export function FieldControl({
  moduleKey,
  field,
  values,
  value,
  onChange,
  disabled,
  showError,
  requiredOverride,
  readOnly,
  hint,
  pattern,
  hiddenOptions,
}: {
  moduleKey: string
  field: FieldMetadata
  /** 当前模块（或条目）取值，用于计算有效必填。 */
  values: ModuleValues
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** 提交拦截后是否高亮缺失必填项。 */
  showError?: boolean
  /**
   * 有效必填的外部判定（跨模块/跨实体条件，如过程步外场由装置引用驱动）。
   * 给定时优先于模块内 isEffectivelyRequired。
   */
  requiredOverride?: boolean
  readOnly?: boolean
  hint?: string
  pattern?: string
  hiddenOptions?: readonly string[]
}) {
  const { i18n, t } = useTranslation()
  const controlId = useId()
  const required =
    requiredOverride ?? isEffectivelyRequired(moduleKey, field, values)
  const enumOptions = parseEnumOptions(field.input, field.options)?.filter(
    (option) => !hiddenOptions?.includes(option),
  )
  const compositeInput = isCompositeInput(field.input) ? field.input : null
  const compositeOptions = compositeInput
    ? (enumOptions ?? parseCompositeOptions(field.options))
    : []
  const missing = Boolean(showError) && required && value.trim() === ''
  const errorId = `${controlId}-error`
  const label = localizedFieldLabel(field, i18n.language)
  const placeholder = localizedFieldPlaceholder(field, i18n.language)
  const fieldHelp = localizedFieldHelp(field, i18n.language)

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel
        htmlFor={controlId}
        labelZh={label}
        unit={localizedUnit(field.unit, i18n.language)}
        required={required}
        r0={field.r0}
      />
      {compositeInput ? (
        <CompositeFieldControl
          input={compositeInput}
          value={value ?? ''}
          options={compositeOptions}
          onChange={onChange}
          inputId={controlId}
          selectId={`${controlId}-option`}
          selectLabel={t('experimentsV2.form.fieldOptions', { label })}
          disabled={disabled || readOnly}
          invalid={missing}
          freePlaceholder={t('experimentsV2.form.inputPlaceholder')}
          selectPlaceholder={t('experimentsV2.form.selectPlaceholder')}
          optionLabel={(option) => localizedOption(option, i18n.language)}
        />
      ) : FORMULA_KEYS.has(field.key) ? (
        <FormulaInput
          id={controlId}
          value={value}
          onChange={onChange}
          disabled={disabled || readOnly}
          placeholder={placeholder}
        />
      ) : enumOptions ? (
        <Select
          value={value ?? ''}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={controlId}
            aria-invalid={missing}
            aria-describedby={missing ? errorId : undefined}
            className={cn('w-full', missing && 'border-destructive')}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {enumOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {localizedOption(option, i18n.language)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : DATETIME_KEYS.has(field.key) ? (
        <Input
          id={controlId}
          type="datetime-local"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          aria-invalid={missing}
          aria-describedby={missing ? errorId : undefined}
          className={cn('w-full', missing && 'border-destructive')}
        />
      ) : TEXTAREA_KEYS.has(field.key) ? (
        <Textarea
          id={controlId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          rows={2}
          placeholder={placeholder}
          aria-invalid={missing}
          aria-describedby={missing ? errorId : undefined}
          className={cn(missing && 'border-destructive')}
        />
      ) : (
        <Input
          id={controlId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || readOnly}
          title={hint}
          pattern={pattern}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={missing}
          aria-describedby={missing ? errorId : undefined}
          className={cn(missing && 'border-destructive')}
        />
      )}
      {missing ? (
        <p id={errorId} className="text-xs text-destructive">
          {t('validation.required')}
        </p>
      ) : null}
      {hint || fieldHelp ? (
        <p className="text-xs text-muted-foreground">{hint || fieldHelp}</p>
      ) : null}
    </div>
  )
}
