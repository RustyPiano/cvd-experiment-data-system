// v2 编辑实验页：拉取 run + §1–§6/§8 模块 payload，还原表单状态，支持分模块保存。
// §7 表征/实测走各自端点，由 ResultsSection 自管拉取，不在此预取。
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Download, Ellipsis } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { HttpError, resolveErrorMessage } from '@/shared/api/http-error'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { RouteLeaveGuard } from '@/shared/ui/route-leave-guard'
import { triggerBlobDownload } from '@/shared/lib/download'
import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  downloadRunExport,
  getModuleOrNull,
  getRun,
  listRunRevisions,
  reviewRun,
  setNotCharacterized,
  transitionRun,
} from './api'
import type { V2ModulePayloadRead } from './api'
import { RunAuditSection } from './components/run-audit-section'
import { ScientificExperimentForm } from './scientific-experiment-form'
import { buildStateFromLoaded } from './form-state'
import { getModuleFields } from './field-logic'
import {
  isEnglish,
  localizedFieldLabel,
  localizedParenthetical,
} from '@/shared/field-i18n'
import {
  availableStatusActions,
  isProcessReadOnly,
  statusBadgeVariant,
  statusBannerKey,
  statusLabelKey,
  statusTransitionInvalidationKeys,
} from './status-logic'
import type { StatusAction } from './status-logic'

const LOADED_MODULE_KEYS = [
  'basic_info',
  'target_product',
  'precursors',
  'substrates',
  'process_steps',
  'process_events',
] as const

const MODULE_TITLE_KEYS = {
  basic_info: 'basicInfo',
  target_product: 'targetProduct',
  equipment: 'equipment',
  precursors: 'precursors',
  substrates: 'substrates',
  process_steps: 'processSteps',
  process_events: 'processEvents',
  characterization: 'results',
  measured_products: 'results',
} as const

export function ExperimentV2EditPage({ runId }: { runId: string }) {
  const { i18n, t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const isAdmin = session.currentUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [locking, setLocking] = useState(false)
  const [invalidating, setInvalidating] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [processDirty, setProcessDirty] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const [focusModule, setFocusModule] = useState<string | null>(null)
  const [missing, setMissing] = useState<
    Array<{
      key: string
      label: string
      module: string
      requirement: 'required' | 'r0'
    }>
  >([])

  const { data, isLoading, isError, error, refetch } = useQuery({
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
  const revisions = useQuery({
    queryKey: ['v2-run-revisions', runId, token],
    enabled: session.isAuthenticated && Boolean(token) && isAdmin,
    queryFn: () => listRunRevisions(runId, token),
  })
  const mutation = useMutation({
    mutationFn: ({
      action,
      reason: invalidReason,
    }: {
      action: StatusAction
      reason?: string
    }) => transitionRun(runId, action, token, invalidReason),
    onSuccess: (run, variables) => {
      setLocking(false)
      setInvalidating(false)
      setUnlocking(false)
      setReason('')
      setMissing([])
      queryClient.setQueryData(
        ['v2-experiment', runId, token],
        (cached: typeof data) => (cached ? { ...cached, run } : cached),
      )
      for (const queryKey of statusTransitionInvalidationKeys(runId, token)) {
        void queryClient.invalidateQueries({ queryKey })
      }
      void queryClient.invalidateQueries({
        queryKey: ['v2-run-revisions', runId, token],
      })
      toast.success(
        variables.action === 'lock'
          ? '实验记录已提交，已根据衬底生成样品。'
          : t('experimentsV2.actions.success'),
      )
    },
    onError: (mutationError) => {
      if (mutationError instanceof HttpError && mutationError.status === 422) {
        const detail = (
          mutationError.payload as { detail?: { missing?: typeof missing } }
        )?.detail
        setMissing(detail?.missing ?? [])
      }
      toast.error(
        resolveErrorMessage(mutationError, t('experimentsV2.actions.error')),
      )
    },
  })
  const notCharacterizedMutation = useMutation({
    mutationFn: (confirmed: boolean) =>
      setNotCharacterized(runId, confirmed, token),
    onSuccess: (run) => {
      queryClient.setQueryData(
        ['v2-experiment', runId, token],
        (cached: typeof data) => (cached ? { ...cached, run } : cached),
      )
      void queryClient.invalidateQueries({
        queryKey: ['v2-experiment-list'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['v2-run-audit', runId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['v2-run-revisions', runId, token],
      })
      toast.success(t('experimentsV2.actions.success'))
    },
    onError: (mutationError) =>
      toast.error(
        resolveErrorMessage(mutationError, t('experimentsV2.actions.error')),
      ),
  })
  const reviewMutation = useMutation({
    mutationFn: () => reviewRun(runId, '', token),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['v2-experiment', runId, token],
      })
      void queryClient.invalidateQueries({
        queryKey: ['v2-run-audit', runId],
      })
      void queryClient.invalidateQueries({
        queryKey: ['v2-run-revisions', runId, token],
      })
      toast.success('当前实验记录已审核')
    },
    onError: (reviewError) =>
      toast.error(resolveErrorMessage(reviewError, '审阅失败')),
  })
  const exportMutation = useMutation({
    mutationFn: () => {
      if (!data?.run.current_revision_id) {
        throw new Error('当前实验记录尚未提交，无法导出。')
      }
      return downloadRunExport(runId, data.run.current_revision_id, token)
    },
    onSuccess: ({ blob, filename }) => {
      triggerBlobDownload(
        blob,
        filename ?? `${data?.run.run_code ?? 'run'}.json`,
      )
      toast.success(t('experimentsV2.export.success'))
    },
    onError: (downloadError) =>
      toast.error(
        resolveErrorMessage(downloadError, t('experimentsV2.export.error')),
      ),
  })
  const act = (action: StatusAction) => {
    if (action === 'invalidate') setInvalidating(true)
    else if (action === 'unlock') setUnlocking(true)
    else setLocking(true)
  }
  const canEditProcess = Boolean(
    data && (isAdmin || session.currentUser?.id === data.run.owner_id),
  )
  useEffect(() => {
    if (processDirty) setMissing([])
  }, [processDirty])

  return (
    <div className="flex flex-col gap-6">
      <RouteLeaveGuard
        when={formDirty}
        message="当前实验记录有未保存的修改，确定离开吗？"
      />
      <PageHeader
        title={data?.run.run_code ?? t('experimentsV2.edit.title')}
        subtitle={
          data?.run.target_material_system
            ? `${data.run.target_material_system} 制备实验`
            : '制备实验记录'
        }
        actions={
          <>
            {data ? (
              <Badge variant={statusBadgeVariant(data.run.status)}>
                {t(statusLabelKey(data.run.status))}
              </Badge>
            ) : null}
            {data ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline">
                    <Ellipsis data-icon="inline-start" />
                    {t('experimentsV2.actions.more')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-56">
                  <DropdownMenuLabel>
                    {t('experimentsV2.actions.more')}
                  </DropdownMenuLabel>
                  <DropdownMenuGroup>
                    {availableStatusActions(
                      data.run.status,
                      canEditProcess,
                      isAdmin,
                    )
                      .filter((action) => action !== 'lock')
                      .map((action) => (
                        <DropdownMenuItem
                          key={action}
                          variant={
                            action === 'invalidate' ? 'destructive' : 'default'
                          }
                          disabled={mutation.isPending}
                          onSelect={() => act(action)}
                        >
                          {t(`experimentsV2.actions.${action}`)}
                        </DropdownMenuItem>
                      ))}
                    {data.run.status === 'locked' &&
                    (data.run.result_missing_todo ||
                      Boolean(data.run.not_characterized_at)) ? (
                      <DropdownMenuItem
                        disabled={notCharacterizedMutation.isPending}
                        onSelect={() =>
                          notCharacterizedMutation.mutate(
                            data.run.not_characterized_at === null,
                          )
                        }
                      >
                        {t(
                          data.run.not_characterized_at
                            ? 'experimentsV2.actions.clearNotCharacterized'
                            : 'experimentsV2.actions.markNotCharacterized',
                        )}
                      </DropdownMenuItem>
                    ) : null}
                    {data.run.status === 'locked' && isAdmin ? (
                      <DropdownMenuItem
                        disabled={reviewMutation.isPending || formDirty}
                        onSelect={() => reviewMutation.mutate()}
                      >
                        {t('experimentsV2.actions.reviewRevision')}
                      </DropdownMenuItem>
                    ) : null}
                    {isAdmin ? (
                      <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                        修改历史
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      disabled={
                        !data.run.current_revision_id ||
                        exportMutation.isPending ||
                        formDirty
                      }
                      onSelect={() => exportMutation.mutate()}
                    >
                      <Download data-icon="inline-start" />
                      {t('experimentsV2.export.run')}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        }
      />
      {isError ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {resolveErrorMessage(error, t('experimentsV2.edit.loadError'))}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              {t('experimentsV2.edit.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {isError ? null : isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          {data.run.status === 'locked' || data.run.status === 'invalid' ? (
            <Alert>
              <AlertDescription>
                {t(statusBannerKey(data.run.status))}
              </AlertDescription>
            </Alert>
          ) : null}
          {!canEditProcess &&
          data.run.status !== 'locked' &&
          data.run.status !== 'invalid' ? (
            <Alert>
              <AlertDescription>
                {t('experimentsV2.banner.notOwner')}
              </AlertDescription>
            </Alert>
          ) : null}
          {missing.length ? (
            <Alert variant="destructive">
              <AlertDescription>
                {t('experimentsV2.actions.missingTitle')}
                <ul className="mt-2 list-disc pl-5">
                  {missing.map((item) => (
                    <li key={`${item.module}.${item.key}`}>
                      <button
                        type="button"
                        className="rounded-sm text-left underline decoration-current/40 underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => {
                          setFocusModule(item.module)
                          window.scrollTo({ top: 0, behavior: 'smooth' })
                        }}
                      >
                        {(() => {
                          const field = getModuleFields(item.module).find(
                            (candidate) => candidate.key === item.key,
                          )
                          return field
                            ? localizedFieldLabel(field, i18n.language)
                            : item.label
                        })()}
                        {isEnglish(i18n.language) ? ' ' : null}
                        {localizedParenthetical(
                          t(
                            `experimentsV2.sections.${MODULE_TITLE_KEYS[item.module as keyof typeof MODULE_TITLE_KEYS] ?? 'unknown'}.title`,
                          ),
                          i18n.language,
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          <ScientificExperimentForm
            key={runId}
            mode="edit"
            runId={runId}
            runCode={data.run.run_code}
            runStatus={data.run.status}
            initialState={buildStateFromLoaded(data.run, data.modules)}
            modules={data.modules}
            processReadOnly={isProcessReadOnly(data.run.status, canEditProcess)}
            focusModule={focusModule}
            onRequestLock={() => setLocking(true)}
            onProcessDirtyChange={setProcessDirty}
            onDirtyChange={setFormDirty}
          />
        </>
      )}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>修改历史</DialogTitle>
            <DialogDescription>
              查看本实验记录的历次提交与重要操作。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6">
            {revisions.data?.items.length ? (
              <section className="grid gap-3">
                <h3 className="font-medium">
                  已提交记录（{revisions.data.items.length}）
                </h3>
                <div className="grid gap-2 md:grid-cols-2">
                  {revisions.data.items.map((revision) => (
                    <div
                      key={revision.id}
                      className="grid gap-1 rounded-lg border p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          第 {revision.revision_number} 次提交
                        </span>
                        <Badge variant="outline">
                          {
                            {
                              locked: '已提交',
                              reviewed: '已审核',
                              superseded: '已更新',
                            }[revision.status]
                          }
                        </Badge>
                      </div>
                      <span className="text-muted-foreground">
                        {new Date(revision.locked_at).toLocaleString()}
                      </span>
                      {revision.correction_reason ? (
                        <span>修改原因：{revision.correction_reason}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            <RunAuditSection runId={runId} token={token} embedded />
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog open={locking} onOpenChange={setLocking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('experimentsV2.actions.lockTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('experimentsV2.actions.lockDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              {t('actions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ action: 'lock' })}
            >
              {t('experimentsV2.actions.lock')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={invalidating} onOpenChange={setInvalidating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('experimentsV2.actions.invalidateTitle')}
            </DialogTitle>
            <DialogDescription>
              {t('experimentsV2.actions.invalidateDescription')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-label={t('experimentsV2.actions.reason')}
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setInvalidating(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || mutation.isPending}
              onClick={() =>
                mutation.mutate({ action: 'invalidate', reason: reason.trim() })
              }
            >
              {t('experimentsV2.actions.invalidate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={unlocking} onOpenChange={setUnlocking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('experimentsV2.actions.unlockTitle')}</DialogTitle>
            <DialogDescription>
              {t('experimentsV2.actions.unlockDescription')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-label="修订原因"
            placeholder="说明需要修正的内容；原记录会保留在修改历史中"
          />
          <DialogFooter>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setUnlocking(false)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={mutation.isPending || !reason.trim()}
              onClick={() =>
                mutation.mutate({
                  action: 'unlock',
                  reason: reason.trim(),
                })
              }
            >
              {t('experimentsV2.actions.unlock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
