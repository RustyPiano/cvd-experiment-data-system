// 化学式输入：文本 + 元素校验（待明确#2）。解析元素符号并对非法符号给出提示，
// 提交拦截由各表单层负责。周期表点选不在本步范围。
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { validateChemicalFormula } from '../formula'

export function FormulaInput({
  id,
  value,
  onChange,
  disabled,
  placeholder,
  ariaDescribedBy,
  required,
  showErrors,
  validator = validateChemicalFormula,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  ariaDescribedBy?: string
  required?: boolean
  showErrors?: boolean
  validator?: typeof validateChemicalFormula
}) {
  const { t } = useTranslation()
  const generatedId = useId()
  const controlId = id ?? generatedId
  const messageId = `${controlId}-formula-message`
  const result = validator(value)
  const missing = Boolean(required && showErrors && result.empty)
  const invalid = missing || (!result.empty && !result.valid)
  const describedBy =
    [invalid || result.elements.length > 0 ? messageId : null, ariaDescribedBy]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={controlId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={cn(invalid && 'border-destructive')}
      />
      {invalid ? (
        <p id={messageId} className="text-xs text-destructive">
          {missing
            ? t('validation.required')
            : result.unknownSymbols.length > 0
              ? t('experimentsV2.formula.unknownSymbols', {
                  symbols: result.unknownSymbols.join('、'),
                })
              : !result.syntaxValid
                ? t('experimentsV2.formula.invalidSyntax')
                : t('experimentsV2.formula.noElement')}
        </p>
      ) : result.elements.length > 0 ? (
        <p id={messageId} className="text-xs text-muted-foreground">
          {t('experimentsV2.formula.parsedElements', {
            elements: result.elements.join(' · '),
          })}
        </p>
      ) : null}
    </div>
  )
}
