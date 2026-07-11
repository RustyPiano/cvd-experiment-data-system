// v2 编辑实验页：拉取 run + §1–§6/§8 模块 payload，还原表单状态，支持分模块保存。
// §7 表征/实测走各自端点，由 ResultsSection 自管拉取，不在此预取。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { HttpError, resolveErrorMessage } from '@/shared/api/http-error'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { getModuleOrNull, getRun, transitionRun } from './api'
import type { V2ModulePayloadRead } from './api'
import { ExperimentV2Form } from './experiment-v2-form'
import { buildStateFromLoaded } from './form-state'
import {
  availableStatusActions,
  isProcessReadOnly,
  isResultsReadOnly,
  statusBannerKey,
} from './status-logic'
import type { StatusAction } from './status-logic'

const LOADED_MODULE_KEYS = [
  'basic_info',
  'target_product',
  'precursors',
  'substrates',
  'process_steps',
  'process_events',
  'pvd',
] as const

export function ExperimentV2EditPage({ runId }: { runId: string }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const queryClient = useQueryClient()
  const [invalidating, setInvalidating] = useState(false)
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState<Array<{ key: string; label: string; module: string }>>([])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['v2-experiment', runId, token],
    enabled: session.isAuthenticated && !!token,
    queryFn: async () => {
      const run = await getRun(runId, token)
      const entries = await Promise.all(
        LOADED_MODULE_KEYS.map(
          async (key) =>
            [key, await getModuleOrNull(runId, key, token)] as const,
        ),
      )
      const modules: Record<string, V2ModulePayloadRead | null> = {}
      for (const [key, payload] of entries) modules[key] = payload
      return { run, modules }
    },
  })
  const mutation = useMutation({
    mutationFn: ({ action, reason: invalidReason }: { action: StatusAction; reason?: string }) =>
      transitionRun(runId, action === 'returnToDraft' ? 'return-to-draft' : action, token, invalidReason),
    onSuccess: async () => {
      setInvalidating(false)
      setReason('')
      setMissing([])
      await queryClient.invalidateQueries({ queryKey: ['v2-experiment', runId, token] })
      toast.success(t('experimentsV2.actions.success'))
    },
    onError: (mutationError) => {
      if (mutationError instanceof HttpError && mutationError.status === 422) {
        const detail = (mutationError.payload as { detail?: { missing?: typeof missing } })?.detail
        setMissing(detail?.missing ?? [])
      }
      toast.error(resolveErrorMessage(mutationError, t('experimentsV2.actions.error')))
    },
  })
  const act = (action: StatusAction) => {
    if (action === 'invalidate') setInvalidating(true)
    else mutation.mutate({ action })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('experimentsV2.edit.title')}
        subtitle={t('experimentsV2.edit.subtitle')}
      />
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(error, t('experimentsV2.edit.loadError'))}
          </AlertDescription>
        </Alert>
      ) : null}
      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {availableStatusActions(data.run.status, session.currentUser?.role === 'admin').map((action) => (
              <Button key={action} variant={action === 'invalidate' ? 'destructive' : 'outline'} disabled={mutation.isPending} onClick={() => act(action)}>
                {t(`experimentsV2.actions.${action}`)}
              </Button>
            ))}
          </div>
          {isProcessReadOnly(data.run.status) ? (
            <Alert><AlertDescription>{t(statusBannerKey(data.run.status))}</AlertDescription></Alert>
          ) : null}
          {missing.length ? (
            <Alert variant="destructive"><AlertDescription>
              {t('experimentsV2.actions.missingTitle')}
              <ul className="mt-2 list-disc pl-5">{missing.map((item) => <li key={`${item.module}.${item.key}`}>{item.label} ({item.module}.{item.key})</li>)}</ul>
            </AlertDescription></Alert>
          ) : null}
          <ExperimentV2Form
            mode="edit"
            runId={runId}
            runCode={data.run.run_code}
            initialState={buildStateFromLoaded(data.run, data.modules)}
            processReadOnly={isProcessReadOnly(data.run.status)}
            resultsReadOnly={isResultsReadOnly(data.run.status)}
          />
        </>
      )}
      <Dialog open={invalidating} onOpenChange={setInvalidating}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('experimentsV2.actions.invalidateTitle')}</DialogTitle><DialogDescription>{t('experimentsV2.actions.invalidateDescription')}</DialogDescription></DialogHeader>
          <Textarea value={reason} onChange={(event) => setReason(event.target.value)} aria-label={t('experimentsV2.actions.reason')} />
          <DialogFooter><Button variant="destructive" disabled={!reason.trim() || mutation.isPending} onClick={() => mutation.mutate({ action: 'invalidate', reason: reason.trim() })}>{t('experimentsV2.actions.invalidate')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
