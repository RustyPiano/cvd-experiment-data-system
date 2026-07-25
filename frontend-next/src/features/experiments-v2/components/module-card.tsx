// 模块分区卡片：标题 + 内容 + 可选「保存本模块」页脚（编辑态分模块草稿保存）。
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function ModuleCard({
  index,
  title,
  children,
  onSave,
  saving,
  saved,
  error,
  id,
  footer,
}: {
  /** 分区序号（§1 / §1b / §2 …），纯展示。 */
  index?: string
  title: string
  children: ReactNode
  /** 提供则渲染「保存本模块」页脚（编辑态）。 */
  onSave?: () => void
  saving?: boolean
  saved?: boolean
  error?: string | null
  /** Stable target for validation summaries and skip navigation. */
  id?: string
  /** Optional custom footer action, used by the compact create flow. */
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Card id={id} tabIndex={id ? -1 : undefined} className="scroll-mt-20">
      <CardHeader>
        <div className="flex flex-wrap items-baseline gap-2">
          {index ? (
            <span className="text-xs font-medium text-muted-foreground">
              {index}
            </span>
          ) : null}
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      {onSave || footer ? (
        <CardFooter className="justify-end gap-3">
          {saved ? (
            <span className="text-xs text-muted-foreground">
              {t('experimentsV2.form.moduleSaved')}
            </span>
          ) : null}
          {footer}
          {onSave ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : null}
              {t('experimentsV2.form.saveModule')}
            </Button>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  )
}
