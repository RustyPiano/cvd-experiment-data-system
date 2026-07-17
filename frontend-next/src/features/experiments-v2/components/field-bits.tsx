// 共享字段标签：标准内部标记不直接暴露给实验人员。
// 文案走 i18n（D12）；字段标签本身来自 field-metadata（生成物）。
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
  return (
    <label
      htmlFor={htmlFor}
      className="flex flex-wrap items-center gap-x-0.5 text-sm font-medium text-foreground"
    >
      <span>{labelZh}</span>
      {unit ? (
        <span className="text-xs font-normal text-muted-foreground">
          （{unit}）
        </span>
      ) : null}
      {required ? <RequiredMark /> : null}
    </label>
  )
}
