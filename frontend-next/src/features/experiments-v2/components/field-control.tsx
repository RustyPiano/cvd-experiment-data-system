// 元数据驱动的单字段控件：标签（含单位/必填红星/R0 徽章）+ 控件（下拉 / 多行 / 文本 /
// 化学式）。必填与显隐由 field-logic 计算。文案走 i18n。
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { FieldMetadata } from '@/shared/generated/field-metadata'
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
}) {
  const { t } = useTranslation()
  const controlId = useId()
  const required = isEffectivelyRequired(moduleKey, field, values)
  const enumOptions = parseEnumOptions(field.options)
  const missing = Boolean(showError) && required && value.trim() === ''
  const placeholder = enumOptions
    ? t('experimentsV2.form.selectPlaceholder')
    : (field.options ?? t('experimentsV2.form.inputPlaceholder'))

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel
        htmlFor={controlId}
        labelZh={field.labelZh}
        unit={field.unit}
        required={required}
        r0={field.r0}
      />
      {FORMULA_KEYS.has(field.key) ? (
        <FormulaInput
          id={controlId}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
        />
      ) : enumOptions ? (
        <Select
          value={value || undefined}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger
            id={controlId}
            aria-invalid={missing}
            className={cn('w-full', missing && 'border-destructive')}
          >
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {enumOptions.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
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
          className={cn(missing && 'border-destructive')}
        />
      ) : (
        <Input
          id={controlId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={missing}
          className={cn(missing && 'border-destructive')}
        />
      )}
      {missing ? (
        <p className="text-xs text-destructive">{t('validation.required')}</p>
      ) : null}
    </div>
  )
}
