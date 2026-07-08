// 模块分区卡片：标题 + 副标题 + 内容 + 可选「保存本模块」页脚（编辑态分模块草稿保存）。
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function ModuleCard({
  index,
  title,
  subtitle,
  children,
  onSave,
  saving,
  saved,
  error,
}: {
  /** 分区序号（§1 / §1b / §2 …），纯展示。 */
  index: string
  title: string
  subtitle?: string
  children: ReactNode
  /** 提供则渲染「保存本模块」页脚（编辑态）。 */
  onSave?: () => void
  saving?: boolean
  saved?: boolean
  error?: string | null
}) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="rounded bg-primary-soft px-1.5 py-0.5 text-xs font-semibold text-primary">
            {index}
          </span>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
        {subtitle ? (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {onSave ? (
          <div className="flex items-center justify-end gap-3">
            {saved ? (
              <span className="text-xs text-muted-foreground">
                {t('experimentsV2.form.moduleSaved')}
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={onSave}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('experimentsV2.form.saveModule')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
