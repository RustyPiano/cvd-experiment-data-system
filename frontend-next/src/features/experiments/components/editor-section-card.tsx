import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

import type { SectionSaveState } from '../editor-types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

// 这些"成功类"消息属于常规自动保存反馈，不需要在卡片内再弹黄色警示。
const QUIET_SAVED_MESSAGES = ['已自动保存', 'Setup 已确认', '已套用模板']

function SaveStateBadge({ state }: { state: SectionSaveState }) {
  if (state.status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        保存中
      </span>
    )
  }
  if (state.status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
        <CheckCircle2 className="size-3.5" />
        已保存
      </span>
    )
  }
  if (state.status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive">
        <AlertCircle className="size-3.5" />
        未保存
      </span>
    )
  }
  return null
}

export function EditorSectionCard({
  children,
  state,
  subtitle,
  title,
}: {
  children: ReactNode
  state: SectionSaveState
  subtitle: string
  title: string
}) {
  const shouldShowSavedWarning =
    state.status === 'saved' &&
    Boolean(state.message) &&
    !QUIET_SAVED_MESSAGES.includes(state.message ?? '')

  return (
    <Card className="scroll-mt-24">
      <CardHeader className="gap-1 pb-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          <SaveStateBadge state={state} />
        </div>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.status === 'error' && state.message ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
        {shouldShowSavedWarning ? (
          <Alert className="border-warning/40 bg-warning-soft text-warning [&>svg]:text-warning">
            <AlertCircle />
            <AlertDescription className="text-foreground">
              {state.message}
            </AlertDescription>
          </Alert>
        ) : null}
        {children}
      </CardContent>
    </Card>
  )
}
