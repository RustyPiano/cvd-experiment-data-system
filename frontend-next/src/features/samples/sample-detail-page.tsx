import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowLeft, Download, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/features/auth/use-auth'
import {
  getExperiment,
  listExperimentFiles,
  downloadExperimentFile,
} from '@/features/experiments/api'
import { getSample, updateSample } from './api'
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
import { Input } from '@/components/ui/input'
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
import { Route } from '@/routes/_authed/samples/$sampleId'

// ─── Types ────────────────────────────────────────────────────────────────────

type SampleFieldKey = keyof SampleUpdateRequest

type SampleFormState = {
  substrateType: string
  brand: string
  sizeMm: string
  treatment: string
  positionMm: string
  storageLocation: string
  metadataJson: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFormState(sample: SampleRead): SampleFormState {
  return {
    substrateType: sample.substrate_type ?? '',
    brand: sample.brand ?? '',
    sizeMm: sample.size_mm ?? '',
    treatment: sample.treatment ?? '',
    positionMm: sample.position_mm === null ? '' : String(sample.position_mm),
    storageLocation: sample.storage_location ?? '',
    metadataJson: JSON.stringify(sample.metadata_json ?? {}, null, 2),
  }
}

function toNullableString(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

function validateMetadataJson(rawValue: string): string | null {
  const normalized = rawValue.trim()
  if (!normalized) return null
  try {
    const parsed = JSON.parse(normalized)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '元数据 JSON 必须是对象'
    }
    return null
  } catch {
    return '元数据 JSON 格式无效'
  }
}

function buildSampleUpdatePayload(
  formState: SampleFormState,
  dirtyFields: SampleFieldKey[],
): SampleUpdateRequest {
  const payload: SampleUpdateRequest = {}
  const dirtyFieldSet = new Set(dirtyFields)

  if (dirtyFieldSet.has('substrate_type')) {
    payload.substrate_type = toNullableString(formState.substrateType)
  }
  if (dirtyFieldSet.has('brand')) {
    payload.brand = toNullableString(formState.brand)
  }
  if (dirtyFieldSet.has('size_mm')) {
    payload.size_mm = toNullableString(formState.sizeMm)
  }
  if (dirtyFieldSet.has('treatment')) {
    payload.treatment = toNullableString(formState.treatment)
  }
  if (dirtyFieldSet.has('position_mm')) {
    const trimmedPosition = formState.positionMm.trim()
    if (!trimmedPosition) {
      payload.position_mm = null
    } else {
      const parsedPosition = Number(trimmedPosition)
      if (!Number.isFinite(parsedPosition)) {
        throw new Error('相对温区位置必须是有限数字')
      }
      payload.position_mm = parsedPosition
    }
  }
  if (dirtyFieldSet.has('storage_location')) {
    payload.storage_location = toNullableString(formState.storageLocation)
  }
  if (dirtyFieldSet.has('metadata_json')) {
    let parsedMetadata: Record<string, unknown>
    try {
      parsedMetadata = JSON.parse(formState.metadataJson || '{}') as Record<
        string,
        unknown
      >
    } catch {
      throw new Error('元数据 JSON 格式无效')
    }
    if (
      parsedMetadata === null ||
      Array.isArray(parsedMetadata) ||
      typeof parsedMetadata !== 'object'
    ) {
      throw new Error('元数据 JSON 必须是对象')
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
  const { sampleId } = Route.useParams()
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

  const canEdit =
    currentUser !== null &&
    experimentQuery.data !== undefined &&
    experimentQuery.data.status === 'draft' &&
    (currentUser.role === 'admin' ||
      currentUser.id === experimentQuery.data.owner_id)

  const hasDirtyFields =
    draftFormState !== null &&
    draftFormState.revision === sampleRevision &&
    draftFormState.dirtyFields.length > 0

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draftFormState || draftFormState.revision !== sampleRevision) {
        throw new Error('样品表单暂不可用')
      }
      setSaveStatus('saving')
      return updateSample(
        session.accessToken!,
        sampleId,
        buildSampleUpdatePayload(
          draftFormState.form,
          draftFormState.dirtyFields,
        ),
      )
    },
    onSuccess: async (savedSample) => {
      setSaveStatus('saved')
      if (saveTriggerRef.current === 'manual') {
        toast.success('样品保存成功')
      }
      setDraftFormState(null)
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
      toast.error(resolveErrorMessage(error, '样品保存失败'))
    },
    onSettled: () => {
      saveTriggerRef.current = null
    },
  })

  const formDisabled = !canEdit || saveMutation.isPending

  const handleDownload = async (file: FileAssetRead) => {
    setDownloadFileId(file.id)
    try {
      const payload = await downloadExperimentFile(
        session.accessToken!,
        file.id,
      )
      triggerBlobDownload(payload.blob, payload.filename || file.original_name)
    } catch (error) {
      toast.error(resolveErrorMessage(error, '文件下载失败'))
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
      saveMutation.mutate()
    }, 900)
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current)
        autosaveTimerRef.current = null
      }
    }
  }, [canEdit, hasDirtyFields, metadataJsonError, saveMutation])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current)
        window.clearTimeout(autosaveTimerRef.current)
    }
  }, [])

  // beforeunload guard
  useEffect(() => {
    if (!hasDirtyFields && !saveMutation.isPending) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasDirtyFields, saveMutation.isPending])

  // ─── Loading / error states ────────────────────────────────────────────────

  if (sampleQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="样品详情" />
        <LoadingState />
      </div>
    )
  }

  if (sampleQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="样品详情"
          subtitle="无法加载样品详情，请检查网络连接或当前账号权限。"
          actions={
            <Button variant="outline" size="sm" asChild>
              <Link to="/experiments">
                <ArrowLeft className="mr-1.5 size-4" />
                返回列表
              </Link>
            </Button>
          }
        />
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(sampleQuery.error, '样品详情加载失败')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!sampleQuery.data) {
    return (
      <Alert variant="destructive">
        <AlertDescription>样品详情暂不可用</AlertDescription>
      </Alert>
    )
  }

  const sample = sampleQuery.data

  return (
    <div className="flex flex-col gap-6">
      <RouteLeaveGuard
        when={hasDirtyFields && !saveMutation.isPending}
        message="样品信息尚未保存，确认离开吗？"
      />

      <PageHeader
        title={`样品详情 · ${sample.sample_code}`}
        subtitle="查看和编辑样品信息，浏览关联文件。仅草稿实验可编辑。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/experiments/$experimentId"
                params={{ experimentId: sample.experiment_run_id }}
              >
                <ArrowLeft className="mr-1.5 size-4" />
                返回实验
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                to="/experiments/$experimentId/files"
                params={{ experimentId: sample.experiment_run_id }}
              >
                <FolderOpen className="mr-1.5 size-4" />
                管理实验文件
              </Link>
            </Button>
          </div>
        }
      />

      {/* Status bar */}
      {canEdit && saveStatus === 'saving' ? (
        <Alert>
          <AlertDescription>正在自动保存...</AlertDescription>
        </Alert>
      ) : null}
      {canEdit && saveStatus === 'saved' && !hasDirtyFields ? (
        <Alert>
          <AlertDescription>已自动保存</AlertDescription>
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
              {sample.role}
            </Badge>
            {experimentQuery.data ? (
              <StatusTag status={experimentQuery.data.status} />
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            实验编号：
            {experimentQuery.data?.run_code ?? sample.experiment_run_id}
          </p>
          {sample.parent_sample_id ? (
            <p className="mt-1 text-sm text-muted-foreground">
              父样品：{sample.parent_sample_id}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Edit form card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">样品信息</CardTitle>
        </CardHeader>
        <CardContent>
          {experimentQuery.isLoading ? (
            <LoadingState />
          ) : experimentQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(experimentQuery.error, '关联实验加载失败')}
              </AlertDescription>
            </Alert>
          ) : formState ? (
            <div className="flex flex-col gap-4">
              {!canEdit ? (
                <Alert>
                  <AlertDescription>
                    当前样品来自非 draft 实验，暂不可编辑。
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="substrate-type">基底类型</Label>
                  <Input
                    id="substrate-type"
                    autoComplete="off"
                    disabled={formDisabled}
                    value={formState.substrateType}
                    onChange={(e) =>
                      updateFormState('substrate_type', (cur) => ({
                        ...cur,
                        substrateType: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="brand">品牌</Label>
                  <Input
                    id="brand"
                    autoComplete="off"
                    disabled={formDisabled}
                    value={formState.brand}
                    onChange={(e) =>
                      updateFormState('brand', (cur) => ({
                        ...cur,
                        brand: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="size-mm">尺寸</Label>
                  <Input
                    id="size-mm"
                    autoComplete="off"
                    disabled={formDisabled}
                    value={formState.sizeMm}
                    onChange={(e) =>
                      updateFormState('size_mm', (cur) => ({
                        ...cur,
                        sizeMm: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="position-mm">相对温区位置</Label>
                  <Input
                    id="position-mm"
                    autoComplete="off"
                    inputMode="decimal"
                    placeholder="数字，可留空"
                    disabled={formDisabled}
                    value={formState.positionMm}
                    onChange={(e) =>
                      updateFormState('position_mm', (cur) => ({
                        ...cur,
                        positionMm: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="treatment">处理方式</Label>
                  <Textarea
                    id="treatment"
                    autoComplete="off"
                    rows={2}
                    disabled={formDisabled}
                    value={formState.treatment}
                    onChange={(e) =>
                      updateFormState('treatment', (cur) => ({
                        ...cur,
                        treatment: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="storage-location">存放位置</Label>
                  <Input
                    id="storage-location"
                    autoComplete="off"
                    disabled={formDisabled}
                    value={formState.storageLocation}
                    onChange={(e) =>
                      updateFormState('storage_location', (cur) => ({
                        ...cur,
                        storageLocation: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="metadata-json">
                    元数据 JSON
                    {metadataJsonError ? (
                      <span id="metadata-json-error" className="ml-2 text-xs text-destructive" role="alert">
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
                    aria-describedby={metadataJsonError ? 'metadata-json-error' : undefined}
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
                    {saveMutation.isPending ? '保存中…' : '保存样品'}
                  </Button>
                  {!saveMutation.isPending ? (
                    <p className="text-sm text-muted-foreground">
                      {hasDirtyFields ? '有未保存的修改' : '修改后自动保存'}
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
          <CardTitle className="text-base">关联文件</CardTitle>
        </CardHeader>
        <CardContent>
          {filesQuery.isLoading ? (
            <LoadingState />
          ) : filesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(filesQuery.error, '样品文件加载失败')}
              </AlertDescription>
            </Alert>
          ) : fileRows.length === 0 ? (
            <EmptyState description="当前样品还没有关联文件。上传文件时选择该样品后会显示在这里。" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>文件名</TableHead>
                    <TableHead>方法</TableHead>
                    <TableHead>类别</TableHead>
                    <TableHead>大小</TableHead>
                    <TableHead>上传时间</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead>操作</TableHead>
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
                      <TableCell>{file.note || '无'}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={downloadFileId === file.id}
                          onClick={() => void handleDownload(file)}
                          aria-label={`下载 ${file.original_name}`}
                        >
                          <Download className="mr-1.5 size-3.5" />
                          {downloadFileId === file.id ? '下载中…' : '下载'}
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
