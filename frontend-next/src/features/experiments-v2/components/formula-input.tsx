// 化学式输入：文本 + 元素校验（待明确#2）。解析元素符号并对非法符号给出提示，
// 非阻断（提交拦截由必填规则负责）。周期表点选不在本步范围。
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
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const { t } = useTranslation()
  const result = validateChemicalFormula(value)
  const invalid = !result.empty && !result.valid

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        aria-invalid={invalid}
        className={cn(invalid && 'border-destructive')}
      />
      {invalid ? (
        <p className="text-xs text-destructive">
          {result.unknownSymbols.length > 0
            ? t('experimentsV2.formula.unknownSymbols', {
                symbols: result.unknownSymbols.join('、'),
              })
            : t('experimentsV2.formula.noElement')}
        </p>
      ) : result.elements.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('experimentsV2.formula.parsedElements', {
            elements: result.elements.join(' · '),
          })}
        </p>
      ) : null}
    </div>
  )
}
