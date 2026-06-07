import { Loader2 } from 'lucide-react'

import type { ExperimentRead } from '@/shared/types/api'
import { StatusTag } from '@/shared/ui/status-tag'
import type { CompletionSummary } from './completion-indicator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

type SubmitState = {
  status: 'idle' | 'submitting' | 'error'
  message: string | null
}

export function EditorActionBar({
  completionSummary,
  experiment,
  isDraft,
  onSaveDraft,
  onSubmit,
  saveDraftLoading,
  saveSummary,
  submitState,
}: {
  completionSummary: CompletionSummary
  experiment: ExperimentRead
  isDraft: boolean
  onSaveDraft: () => void
  onSubmit: () => void
  saveDraftLoading: boolean
  saveSummary: string
  submitState: SubmitState
}) {
  const completionText = `总完成度 ${completionSummary.percent}% · 已完成 ${completionSummary.completedCount}/${completionSummary.totalCount} · 阻塞 ${completionSummary.blockingCount} · 提示 ${completionSummary.warningCount}`
  const isSubmitDeemphasized =
    completionSummary.blockingCount > 0 || submitState.status === 'error'

  return (
    <Card className="sticky bottom-4 z-10 gap-0 p-4 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/95">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {experiment.run_code}
            </code>
            <StatusTag status={experiment.status} />
            <span className="text-sm text-muted-foreground">{saveSummary}</span>
            <span className="text-sm text-muted-foreground">
              {completionText}
            </span>
          </div>
          {!isDraft ? (
            <p className="text-sm text-muted-foreground">
              当前实验已离开 draft 状态，编辑器保持只读。
            </p>
          ) : null}
        </div>
        {isDraft ? (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={saveDraftLoading}
              onClick={() => void onSaveDraft()}
            >
              {saveDraftLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              保存草稿
            </Button>
            <Button
              variant={isSubmitDeemphasized ? 'outline' : 'default'}
              disabled={submitState.status === 'submitting'}
              onClick={() => void onSubmit()}
            >
              {submitState.status === 'submitting' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              提交实验
            </Button>
          </div>
        ) : null}
      </div>
      {submitState.status === 'error' && submitState.message ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{submitState.message}</AlertDescription>
        </Alert>
      ) : null}
    </Card>
  )
}
