// 共享字段标签：标准内部标记不直接暴露给实验人员。
// 文案走 i18n（D12）；字段标签本身来自 field-metadata（生成物）。
import { useTranslation } from 'react-i18next'
import { localizedParenthetical } from '@/shared/field-i18n'
import { RequiredMark } from '@/shared/ui/required-mark'

export function FieldLabel({
  labelZh,
  unit,
  required,
  r0: _r0,
  htmlFor,
}: {
  labelZh: string
  unit: string | null
  required: boolean
  r0: boolean
  htmlFor?: string
}) {
  const { i18n } = useTranslation()
  return (
    <label
      htmlFor={htmlFor}
      className="flex flex-wrap items-center gap-x-0.5 text-sm font-medium text-foreground"
    >
      <span>{labelZh}</span>
      {unit ? (
        <span className="text-xs font-normal text-muted-foreground">
          {localizedParenthetical(unit, i18n.language)}
        </span>
      ) : null}
      {required ? <RequiredMark /> : null}
    </label>
  )
}
