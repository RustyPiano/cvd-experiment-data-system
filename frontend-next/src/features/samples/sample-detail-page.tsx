import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import i18n from '@/shared/i18n'

import { useAuth } from '@/features/auth/use-auth'
import { isResultsReadOnly } from '@/features/experiments-v2/status-logic'
import {
  downloadExperimentFile,
  getExperiment,
  getSample,
  listExperimentFiles,
  updateSample,
} from './api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import { PageHeader } from '@/shared/ui/page-header'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { RouteLeaveGuard } from '@/shared/ui/route-leave-guard'
import { StatusTag } from '@/shared/ui/status-tag'
import type {
  FileAssetRead,
  SampleRead,
  SampleUpdateRequest,
} from '@/shared/types/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── Route (imported by route file) ──────────────────────────────────────────
const routeApi = getRouteApi('/_authed/samples/$sampleId')

// ─── Types ────────────────────────────────────────────────────────────────────

type SampleFieldKey = keyof SampleUpdateRequest

type SampleFormState = {
  metadataJson: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFormState(sample: SampleRead): SampleFormState {
  return {
    metadataJson: JSON.stringify(sample.metadata_json ?? {}, null, 2),
  }
}

function validateMetadataJson(rawValue: string): string | null {
  const normalized = rawValue.trim()
  if (!normalized) return null
  try {
    const parsed = JSON.parse(normalized)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return i18n.t('samples.validation.metadataObject')
    }
    return null
  } catch {
    return i18n.t('samples.validation.metadataInvalid')
  }
}

function buildSampleUpdatePayload(
  formState: SampleFormState,
  dirtyFields: SampleFieldKey[],
): SampleUpdateRequest {
  const payload: SampleUpdateRequest = {}
  const dirtyFieldSet = new Set(dirtyFields)

  if (dirtyFieldSet.has('metadata_json')) {
    let parsedMetadata: Record<string, unknown>
    try {
      parsedMetadata = JSON.parse(formState.metadataJson || '{}') as Record<
        string,
        unknown
      >
    } catch {
      throw new Error(i18n.t('samples.validation.metadataInvalid'))
    }
    if (
      parsedMetadata === null ||
      Array.isArray(parsedMetadata) ||
      typeof parsedMetadata !== 'object'
    ) {
      throw new Error(i18n.t('samples.validation.metadataObject'))
    }
    payload.metadata_json = parsedMetadata
  }

  return payload
}

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KiB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SampleDetailPage() {
  const { t } = useTranslation()
  const { sampleId } = routeApi.useParams()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const currentUser = session.currentUser
  const viewerKey = currentUser?.id ?? 'anonymous'

  const [draftFormState, setDraftFormState] = useState<{
    dirtyFields: SampleFieldKey[]
    form: SampleFormState
    revision: string
  } | null>(null)
  const [downloadFileId, setDownloadFileId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const autosaveTimerRef = useRef<number | null>(null)
  const saveTriggerRef = useRef<'auto' | 'manual' | null>(null)

  const sampleQuery = useQuery({
    queryKey: ['samples', 'detail', viewerKey, sampleId],
    queryFn: () => getSample(session.accessToken!, sampleId),
    enabled: session.isAuthenticated && Boolean(sampleId),
  })

  const experimentId = sampleQuery.data?.experiment_run_id ?? ''

  const experimentQuery = useQuery({
    queryKey: ['experiments', 'detail', viewerKey, experimentId],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const filesQuery = useQuery({
    queryKey: ['samples', 'files', viewerKey, sampleId],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, { experimentId, sampleId }),
    enabled:
      session.isAuthenticated && Boolean(experimentId) && Boolean(sampleId),
  })

  const sampleRevision = sampleQuery.data
    ? `${sampleQuery.data.id}:${sampleQuery.data.updated_at}`
    : null

  const formState =
    draftFormState && draftFormState.revision === sampleRevision
      ? draftFormState.form
      : sampleQuery.data
        ? buildFormState(sampleQuery.data)
        : null

  const metadataJsonError = formState
    ? validateMetadataJson(formState.metadataJson)
    : null

  const canWrite =
    currentUser !== null &&
    experimentQuery.data !== undefined &&
    (currentUser.role === 'admin' ||
      currentUser.id === experimentQuery.data.owner_id)
  const canEdit =
    experimentQuery.data !== undefined &&
    !isResultsReadOnly(experimentQuery.data.status, canWrite)

  const hasDirtyFields =
    draftFormState !== null &&
    draftFormState.revision === sampleRevision &&
    draftFormState.dirtyFields.length > 0

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draftFormState || draftFormState.revision !== sampleRevision) {
        throw new Error(i18n.t('samples.detail.formUnavailable'))
      }
      setSaveStatus('saving')
      const savedSample = await updateSample(
        session.accessToken!,
        sampleId,
        buildSampleUpdatePayload(
          draftFormState.form,
          draftFormState.dirtyFields,
        ),
      )
      return { savedSample, savingDraft: draftFormState }
    },
    onSuccess: async ({ savedSample, savingDraft }) => {
      setSaveStatus('saved')
      if (saveTriggerRef.current === 'manual') {
        toast.success(t('samples.detail.saveSuccess'))
      }
      setDraftFormState((current) =>
        current === savingDraft || !current
          ? null
          : {
              ...current,
              revision: `${savedSample.id}:${savedSample.updated_at}`,
            },
      )
      queryClient.setQueryData(
        ['samples', 'detail', viewerKey, sampleId],
        savedSample,
      )
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            'experiments',
            'samples',
            viewerKey,
            savedSample.experiment_run_id,
          ],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            'experiments',
            'detail',
            viewerKey,
            savedSample.experiment_run_id,
          ],
        }),
      ])
    },
    onError: (error) => {
      setSaveStatus('error')
      toast.error(resolveErrorMessage(error, t('samples.detail.saveError')))
    },
    onSettled: () => {
      saveTriggerRef.current = null
    },
  })

  const saveMutateRef = useRef(saveMutation.mutate)
  saveMutateRef.current = saveMutation.mutate

  const formDisabled = !canEdit

  const handleDownload = async (file: FileAssetRead) => {
    setDownloadFileId(file.id)
    try {
      const payload = await downloadExperimentFile(
        session.accessToken!,
        file.id,
      )
      triggerBlobDownload(payload.blob, payload.filename || file.original_name)
    } catch (error) {
      toast.error(resolveErrorMessage(error, t('samples.detail.downloadError')))
    } finally {
      setDownloadFileId(null)
    }
  }

  const fileRows = useMemo(
    () => filesQuery.data?.items ?? [],
    [filesQuery.data?.items],
  )

  const updateFormState = (
    field: SampleFieldKey,
    updater: (current: SampleFormState) => SampleFormState,
  ) => {
    if (!sampleQuery.data || !sampleRevision) return
    setDraftFormState((current) => {
      const base =
        current && current.revision === sampleRevision
          ? current.form
          : buildFormState(sampleQuery.data)
      const currentDirtyFields =
        current && current.revision === sampleRevision
          ? current.dirtyFields
          : []
      return {
        dirtyFields: currentDirtyFields.includes(field)
          ? currentDirtyFields
          : [...currentDirtyFields, field],
        form: updater(base),
        revision: sampleRevision,
      }
    })
  }

  // Autosave
  useEffect(() => {
    if (
      !canEdit ||
      !hasDirtyFields ||
      metadataJsonError ||
      saveMutation.isPending
    )
      return
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(() => {
      saveTriggerRef.current = 'auto'
      saveMutateRef.current()
    }, 900)
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [canEdit, hasDirtyFields, metadataJsonError, saveMutation.isPending])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current)
        window.clearTimeout(autosaveTimerRef.current)
    }
  }, [])

  // ─── Loading / error states ────────────────────────────────────────────────

  if (sampleQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('samples.detail.title')} />
        <LoadingState />
      </div>
    )
  }

  if (sampleQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t('samples.detail.title')}
          subtitle={t('samples.detail.loadErrorSubtitle')}
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/experiments">
                <ArrowLeft className="mr-1.5 size-4" />
                {t('samples.actions.backToList')}
              </Link>
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(
              sampleQuery.error,
              t('samples.detail.loadError'),
            )}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!sampleQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {t('samples.detail.unavailable')}
        </AlertDescription>
      </Alert>
    )
  }

  const sample = sampleQuery.data

  return (
    <div className="flex flex-col gap-6">
      <RouteLeaveGuard
        when={hasDirtyFields || saveMutation.isPending}
        message={t('samples.detail.leaveWarning')}
      />

      <PageHeader
        title={t('samples.detail.titleWithCode', { code: sample.sample_code })}
        subtitle={t('samples.detail.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/experiments/$runId/edit"
                params={{ runId: sample.experiment_run_id }}
              >
                <ArrowLeft className="mr-1.5 size-4" />
                {t('samples.actions.backToRun')}
              </Link>
            </Button>
          </div>
        }
      />

      {/* Status bar */}
      {canEdit && saveStatus === 'saving' ? (
        <Alert>
          <AlertDescription>{t('samples.detail.autoSaving')}</AlertDescription>
        </Alert>
      ) : null}
      {canEdit && saveStatus === 'saved' && !hasDirtyFields ? (
        <Alert>
          <AlertDescription>{t('samples.detail.autoSaved')}</AlertDescription>
        </Alert>
      ) : null}

      {/* Identity card */}
      <Card>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
              {sample.sample_code}
            </code>
            <Badge className="bg-primary-soft text-accent-foreground border-transparent">
              {t(`experimentsV2.sections.results.roles.${sample.role}`, {
                defaultValue: sample.role,
              })}
            </Badge>
            {experimentQuery.data ? (
              <StatusTag status={experimentQuery.data.status} />
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('samples.detail.runCode')}
            {experimentQuery.data?.run_code ?? sample.experiment_run_id}
          </p>
          {sample.parent_sample_id ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t('samples.detail.parentSample', {
                id: sample.parent_sample_id,
              })}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Edit form card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t('samples.detail.sampleInfo')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {experimentQuery.isLoading ? (
            <LoadingState />
          ) : experimentQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(
                  experimentQuery.error,
                  t('samples.detail.runLoadError'),
                )}
              </AlertDescription>
            </Alert>
          ) : formState ? (
            <div className="flex flex-col gap-4">
              {!canEdit ? (
                <Alert>
                  <AlertDescription>
                    {t('samples.detail.readOnly')}
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="metadata-json">
                    {t('samples.detail.metadataJson')}
                    {metadataJsonError ? (
                      <span
                        id="metadata-json-error"
                        className="ml-2 text-xs text-destructive"
                        role="alert"
                      >
                        {metadataJsonError}
                      </span>
                    ) : null}
                  </Label>
                  <Textarea
                    id="metadata-json"
                    autoComplete="off"
                    rows={6}
                    disabled={formDisabled}
                    className={metadataJsonError ? 'border-destructive' : ''}
                    aria-invalid={metadataJsonError ? 'true' : undefined}
                    aria-describedby={
                      metadataJsonError ? 'metadata-json-error' : undefined
                    }
                    value={formState.metadataJson}
                    onChange={(e) =>
                      updateFormState('metadata_json', (cur) => ({
                        ...cur,
                        metadataJson: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {canEdit ? (
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    disabled={
                      !hasDirtyFields ||
                      Boolean(metadataJsonError) ||
                      saveMutation.isPending
                    }
                    onClick={() => {
                      if (autosaveTimerRef.current) {
                        window.clearTimeout(autosaveTimerRef.current)
                        autosaveTimerRef.current = null
                      }
                      saveTriggerRef.current = 'manual'
                      saveMutation.mutate()
                    }}
                  >
                    {saveMutation.isPending
                      ? t('samples.detail.saving')
                      : t('samples.detail.save')}
                  </Button>
                  {!saveMutation.isPending ? (
                    <p className="text-sm text-muted-foreground">
                      {hasDirtyFields
                        ? t('samples.detail.unsavedChanges')
                        : t('samples.detail.autosaveHint')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Files card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t('samples.detail.files.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filesQuery.isLoading ? (
            <LoadingState />
          ) : filesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(
                  filesQuery.error,
                  t('samples.detail.files.loadError'),
                )}
              </AlertDescription>
            </Alert>
          ) : fileRows.length === 0 ? (
            <EmptyState description={t('samples.detail.files.empty')} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('samples.detail.files.name')}</TableHead>
                    <TableHead>{t('samples.detail.files.method')}</TableHead>
                    <TableHead>{t('samples.detail.files.category')}</TableHead>
                    <TableHead>{t('samples.detail.files.size')}</TableHead>
                    <TableHead>{t('samples.detail.files.uploadedAt')}</TableHead>
                    <TableHead>{t('samples.detail.files.note')}</TableHead>
                    <TableHead>{t('samples.detail.files.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fileRows.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        {file.original_name}
                      </TableCell>
                      <TableCell>{file.method ?? '—'}</TableCell>
                      <TableCell>{file.file_category}</TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {formatBytes(file.size_bytes)}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {dayjs(file.created_at).format('YYYY-MM-DD HH:mm')}
                      </TableCell>
                      <TableCell>
                        {file.note || t('samples.common.none')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadFileId === file.id}
                          onClick={() => void handleDownload(file)}
                          aria-label={t('samples.detail.files.downloadLabel', {
                            filename: file.original_name,
                          })}
                        >
                          <Download className="mr-1.5 size-3.5" />
                          {downloadFileId === file.id
                            ? t('samples.detail.files.downloading')
                            : t('samples.detail.files.download')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
