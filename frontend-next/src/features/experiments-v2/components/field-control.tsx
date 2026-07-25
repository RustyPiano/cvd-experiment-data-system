// 元数据驱动的单字段控件：标签（含单位/必填红星）+ 控件（下拉 / 多行 / 文本 /
// 化学式）。必填与显隐由 field-logic 计算。文案走 i18n。
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
import {
  canonicalOption,
  localizedFieldHelp,
  localizedFieldLabel,
  localizedFieldPlaceholder,
  localizedOption,
  localizedUnit,
} from '@/shared/field-i18n'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
  parseCompositeValue,
} from '@/shared/composite-field'
import { CompositeFieldControl } from '@/shared/ui/composite-field-control'
import { SelectWithOtherControl } from '@/shared/ui/select-with-other-control'
import {
  isOtherOptionMarker,
  isNoneOption,
  isSelectWithOtherInput,
} from '@/features/entity-library/field-logic'
import type { ModuleFieldValue, ModuleValues } from '../field-logic'
import {
  isEffectivelyRequired,
  isMultiValueInput,
  moduleValueAsString,
  moduleValueIsEmpty,
  parseEnumOptions,
} from '../field-logic'
import { FieldLabel } from './field-bits'
import { FormulaInput } from './formula-input'
import { isStructuredInput, structuredPayload } from '@/shared/structured-field'
import { StructuredObjectControl } from '@/shared/ui/structured-object-control'
import {
  numericInputAttributes,
  numericValidationIssue,
} from '@/shared/field-validation'

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

// 用化学式元素校验控件的字段键（§1b 目标材料化学式）。
const FORMULA_KEYS = new Set(['chemical_formula'])

// 用 datetime-local 控件的字段键（§1 实验时间、§6 事件发生时刻）。
const DATETIME_KEYS = new Set(['started_at', 'occurred_at'])

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
  hideHelp,
}: {
  moduleKey: string
  field: FieldMetadata
  /** 当前模块（或条目）取值，用于计算有效必填。 */
  values: ModuleValues
  value: ModuleFieldValue
  onChange: (value: ModuleFieldValue) => void
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
  hideHelp?: boolean
}) {
  const { i18n, t } = useTranslation()
  const controlId = useId()
  const required =
    requiredOverride ?? isEffectivelyRequired(moduleKey, field, values)
  const allowsOther = isSelectWithOtherInput(field.input)
  const parsedEnumOptions = parseEnumOptions(
    field.input,
    field.options,
  )?.filter(
    (option) =>
      !hiddenOptions?.map(canonicalOption).includes(option) &&
      (!allowsOther || !isOtherOptionMarker(option)),
  )
  const enumOptions = parsedEnumOptions
  const multiValue = isMultiValueInput(field.input)
  const selectedValues = Array.isArray(value)
    ? value.map(canonicalOption)
    : moduleValueAsString(value)
      ? [canonicalOption(moduleValueAsString(value))]
      : []
  const textValue = moduleValueAsString(value)
  const compositeInput = isCompositeInput(field.input) ? field.input : null
  const structuredInput = isStructuredInput(field.input)
  const booleanInput = field.input === '复选' || field.input === '复选确认'
  const compositeOptions = compositeInput
    ? (enumOptions ?? parseCompositeOptions(field.options))
    : []
  const numeric = field.input === '数值'
  const numericText = compositeInput?.includes('数值')
    ? parseCompositeValue(
        compositeInput,
        textValue,
        compositeOptions,
      ).freeValue.trim()
    : numeric
      ? textValue.trim()
      : ''
  const numericIssue =
    numericText === ''
      ? null
      : numericValidationIssue(numericText, field.validation)
  const numericAttributes = numericInputAttributes(field.validation)
  const missing =
    Boolean(showError) &&
    required &&
    (moduleValueIsEmpty(value) ||
      (field.input === '复选确认' && textValue !== 'true'))
  const compositeNumericMissing =
    Boolean(showError) &&
    required &&
    Boolean(field.validation?.require_value) &&
    Boolean(compositeInput?.includes('数值')) &&
    numericText === ''
  let structuredInvalid = false
  if (structuredInput && textValue.trim()) {
    try {
      structuredPayload(field.key, textValue)
    } catch {
      structuredInvalid = true
    }
  }
  const spaceGroupInvalid =
    field.key === 'bulk_space_group' &&
    textValue.trim() !== '' &&
    (!Number.isInteger(Number(textValue)) ||
      Number(textValue) < 1 ||
      Number(textValue) > 230)
  const invalid =
    missing ||
    compositeNumericMissing ||
    spaceGroupInvalid ||
    Boolean(numericIssue) ||
    structuredInvalid
  const numericErrorMessage = (() => {
    switch (numericIssue?.kind) {
      case 'finite':
        return t('validation.finiteNumber')
      case 'integer':
        return t('validation.integerNumber')
      case 'ge':
        return t('validation.numberGe', { limit: numericIssue.limit })
      case 'gt':
        return t('validation.numberGt', { limit: numericIssue.limit })
      case 'le':
        return t('validation.numberLe', { limit: numericIssue.limit })
      case 'lt':
        return t('validation.numberLt', { limit: numericIssue.limit })
      default:
        return null
    }
  })()
  const errorId = `${controlId}-error`
  const label = localizedFieldLabel(field, i18n.language)
  const phaseState = canonicalOption(moduleValueAsString(values['phase_state']))
  const unit =
    moduleKey === 'precursors' && field.key === 'amount'
      ? phaseState === 'solid'
        ? 'mg'
        : phaseState === 'liquid'
          ? 'µL'
          : null
      : localizedUnit(field.unit, i18n.language)
  const placeholder = localizedFieldPlaceholder(field, i18n.language)
  const fieldHelp = hideHelp ? null : localizedFieldHelp(field, i18n.language)
  const fieldHelpId = fieldHelp ? `${controlId}-help` : undefined
  const hintId = hint ? `${controlId}-hint` : undefined
  const describedBy =
    [invalid ? errorId : null, fieldHelpId, hintId].filter(Boolean).join(' ') ||
    undefined
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel
        htmlFor={multiValue ? undefined : controlId}
        labelZh={label}
        unit={unit}
        required={required}
        r0={field.r0}
      />
      {booleanInput ? (
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox
            id={controlId}
            checked={textValue === 'true'}
            disabled={disabled || readOnly}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            onCheckedChange={(checked) =>
              onChange(checked === true ? 'true' : 'false')
            }
          />
          <span>{label}</span>
        </label>
      ) : structuredInput ? (
        <StructuredObjectControl
          fieldKey={field.key}
          value={textValue}
          onChange={onChange}
          disabled={disabled || readOnly}
          invalid={invalid}
          ariaDescribedBy={describedBy}
        />
      ) : compositeInput ? (
        <CompositeFieldControl
          input={compositeInput}
          value={textValue}
          options={compositeOptions}
          onChange={onChange}
          inputId={controlId}
          selectId={`${controlId}-option`}
          selectLabel={t('experimentsV2.form.fieldOptions', { label })}
          disabled={disabled || readOnly}
          invalid={invalid}
          ariaDescribedBy={describedBy}
          freePlaceholder={t('experimentsV2.form.inputPlaceholder')}
          selectPlaceholder={t('experimentsV2.form.selectPlaceholder')}
          validation={field.validation}
          optionLabel={(option) => localizedOption(option, i18n.language)}
        />
      ) : FORMULA_KEYS.has(field.key) ? (
        <FormulaInput
          id={controlId}
          value={textValue}
          onChange={(next) => onChange(next)}
          disabled={disabled || readOnly}
          placeholder={placeholder}
          ariaDescribedBy={describedBy}
        />
      ) : enumOptions && multiValue ? (
        <div
          id={controlId}
          role="group"
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            'grid gap-2 rounded-md border border-input px-3 py-2 sm:grid-cols-2',
            invalid && 'border-destructive',
          )}
        >
          {enumOptions.map((option) => {
            const optionLabel = localizedOption(option, i18n.language)
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  aria-label={optionLabel}
                  checked={selectedValues.includes(option)}
                  disabled={disabled || readOnly}
                  onCheckedChange={(checked) => {
                    if (!checked) {
                      onChange(selectedValues.filter((item) => item !== option))
                      return
                    }
                    onChange(
                      isNoneOption(option)
                        ? [option]
                        : [
                            ...selectedValues.filter(
                              (item) => !isNoneOption(item) && item !== option,
                            ),
                            option,
                          ],
                    )
                  }}
                />
                <span>{optionLabel}</span>
              </label>
            )
          })}
        </div>
      ) : enumOptions && allowsOther ? (
        <SelectWithOtherControl
          value={textValue}
          options={enumOptions}
          onChange={(next) => onChange(next)}
          disabled={disabled || readOnly}
          selectId={controlId}
          invalid={invalid}
          ariaDescribedBy={describedBy}
          placeholder={placeholder}
          otherLabel={t('experimentsV2.form.otherOption')}
          otherInputLabel={t('experimentsV2.form.otherInputLabel', { label })}
          otherPlaceholder={t('experimentsV2.form.otherPlaceholder')}
          optionLabel={(option) => localizedOption(option, i18n.language)}
        />
      ) : enumOptions ? (
        <Select
          value={textValue}
          onValueChange={(next) => onChange(next)}
          disabled={disabled || readOnly}
        >
          <SelectTrigger
            id={controlId}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={cn('w-full', invalid && 'border-destructive')}
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
          value={textValue}
          onInput={(event) => onChange(event.currentTarget.value)}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn('w-full', invalid && 'border-destructive')}
        />
      ) : TEXTAREA_KEYS.has(field.key) ? (
        <Textarea
          id={controlId}
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          rows={2}
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(invalid && 'border-destructive')}
        />
      ) : (
        <Input
          id={controlId}
          type={numeric ? 'number' : 'text'}
          inputMode={numeric ? 'decimal' : undefined}
          min={
            field.key === 'bulk_space_group'
              ? 1
              : numeric
                ? numericAttributes.min
                : undefined
          }
          max={
            field.key === 'bulk_space_group'
              ? 230
              : numeric
                ? numericAttributes.max
                : undefined
          }
          step={
            field.key === 'bulk_space_group'
              ? 1
              : numeric
                ? numericAttributes.step
                : undefined
          }
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled || readOnly}
          title={hint}
          pattern={pattern}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(invalid && 'border-destructive')}
        />
      )}
      {invalid ? (
        <p id={errorId} className="text-xs text-destructive">
          {spaceGroupInvalid
            ? t('validation.spaceGroupRange')
            : structuredInvalid
              ? t('validation.structuredField')
              : compositeNumericMissing
                ? t('validation.numericValueRequired')
                : numericErrorMessage
                  ? numericErrorMessage
                  : t('validation.required')}
        </p>
      ) : null}
      {fieldHelp ? (
        <p id={fieldHelpId} className="text-xs text-muted-foreground">
          {fieldHelp}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
