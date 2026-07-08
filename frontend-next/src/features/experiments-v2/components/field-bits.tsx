// 共享的小组件：字段标签（标签 + 单位 + 必填红星 + R0 徽章）、R0 徽章。
// 文案走 i18n（D12）；字段标签本身来自 field-metadata（生成物）。
import { useTranslation } from 'react-i18next'
import { RequiredMark } from '@/shared/ui/required-mark'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** R0 最小可复现集徽章。 */
export function R0Badge({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      title={t('experimentsV2.r0.tooltip')}
      className={cn(
        'ml-1 border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[10px] font-semibold text-amber-600 dark:text-amber-400',
        className,
      )}
    >
      {t('experimentsV2.r0.badge')}
    </Badge>
  )
}

export function FieldLabel({
  labelZh,
  unit,
  required,
  r0,
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
      {r0 ? <R0Badge /> : null}
    </label>
  )
}
