import { useCallback, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowUpDown,
  Download,
  Loader2,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'

import { Route } from '@/routes/_authed/experiments/$experimentId/files'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { StatusTag } from '@/shared/ui/status-tag'
import type { FileAssetRead } from '@/shared/types/api'
import { triggerBlobDownload } from '@/shared/lib/download'
import { useAuth } from '@/features/auth/use-auth'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  deleteExperimentFile,
  downloadExperimentFile,
  getExperiment,
  listActiveVocabularies,
  listExperimentFiles,
  listExperimentSamples,
  uploadExperimentFile,
} from './api'

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KiB`
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
}

const fileCategoryOptions = [
  { label: '原始文件', value: 'raw' },
  { label: '已处理', value: 'processed' },
]

const filterCategoryOptions = [
  { label: '全部', value: '' },
  ...fileCategoryOptions,
]

type FileAssetRole = 'characterization_file' | 'setup_diagram'

const assetRoleOptions: Array<{ label: string; value: FileAssetRole }> = [
  { label: '表征文件', value: 'characterization_file' },
  { label: 'Setup 图', value: 'setup_diagram' },
]

function formatFileCategory(value: string) {
  return (
    fileCategoryOptions.find((option) => option.value === value)?.label ?? value
  )
}

class UploadCanceledError extends Error {
  successfulIndices: number[]
  total: number

  constructor(successfulIndices: number[], total: number) {
    super(`已取消上传，已成功 ${successfulIndices.length} / ${total} 个文件。`)
    this.name = 'UploadCanceledError'
    this.successfulIndices = successfulIndices
    this.total = total
  }
}

function isUploadCanceledError(error: unknown): error is UploadCanceledError {
  return error instanceof UploadCanceledError
}

class UploadPartialFailureError extends Error {
  successfulIndices: number[]

  constructor(message: string, successfulIndices: number[]) {
    super(message)
    this.name = 'UploadPartialFailureError'
    this.successfulIndices = successfulIndices
  }
}

function isUploadPartialFailureError(
  error: unknown,
): error is UploadPartialFailureError {
  return error instanceof UploadPartialFailureError
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function mergeMethodOptions(
  vocabularyOptions: Array<{ label: string; value: string }>,
  fileMethods: string[],
) {
  const seenValues = new Set(vocabularyOptions.map((option) => option.value))
  return [
    ...vocabularyOptions,
    ...fileMethods
      .map((method) => method.trim())
      .filter((method) => method.length > 0 && !seenValues.has(method))
      .map((method) => ({ label: method, value: method })),
  ]
}

type SortKey =
  | 'original_name'
  | 'method'
  | 'file_category'
  | 'size_bytes'
  | 'created_at'

const PAGE_SIZE = 10
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB, matches the backend limit

export function ExperimentFilesPage() {
  const { experimentId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const currentUser = session.currentUser
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [methodFilter, setMethodFilter] = useState('')
  const [fileCategoryFilter, setFileCategoryFilter] = useState('')
  const [uploadMethod, setUploadMethod] = useState('')
  const [uploadSampleId, setUploadSampleId] = useState('')
  const [uploadNote, setUploadNote] = useState('')
  const [fileCategory, setFileCategory] = useState('raw')
  const [assetRole, setAssetRole] = useState<FileAssetRole>(
    'characterization_file',
  )
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [downloadFileId, setDownloadFileId] = useState<string | null>(null)
  const [mutationMessage, setMutationMessage] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{
    done: number
    total: number
  } | null>(null)
  const [fileToDelete, setFileToDelete] = useState<FileAssetRead | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const abortRef = useRef(false)
  const uploadAbortControllerRef = useRef<AbortController | null>(null)

  const experimentQuery = useQuery({
    queryKey: [
      'experiments',
      'detail',
      currentUser?.id ?? 'anonymous',
      experimentId,
    ],
    queryFn: () => getExperiment(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const filesQuery = useQuery({
    queryKey: [
      'experiments',
      'files',
      currentUser?.id ?? 'anonymous',
      experimentId,
      methodFilter,
      fileCategoryFilter,
    ],
    queryFn: () =>
      listExperimentFiles(session.accessToken!, {
        experimentId,
        fileCategory: fileCategoryFilter || null,
        method: methodFilter || null,
      }),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const samplesQuery = useQuery({
    queryKey: [
      'experiments',
      'samples',
      currentUser?.id ?? 'anonymous',
      experimentId,
    ],
    queryFn: () => listExperimentSamples(session.accessToken!, experimentId),
    enabled: session.isAuthenticated && Boolean(experimentId),
  })

  const vocabulariesQuery = useQuery({
    queryKey: [
      'vocabularies',
      'characterization_method',
      currentUser?.id ?? 'anonymous',
    ],
    queryFn: () =>
      listActiveVocabularies(session.accessToken!, 'characterization_method'),
    enabled: session.isAuthenticated,
  })

  const canManageFiles =
    currentUser != null &&
    experimentQuery.data !== undefined &&
    experimentQuery.data.status === 'draft' &&
    currentUser.role !== 'viewer' &&
    (currentUser.role === 'admin' ||
      currentUser.id === experimentQuery.data.owner_id)

  const sampleCodeById = useMemo(() => {
    const sampleMap = new Map<string, string>()
    for (const sample of samplesQuery.data?.items ?? []) {
      sampleMap.set(sample.id, sample.sample_code)
    }
    return sampleMap
  }, [samplesQuery.data?.items])

  const methodOptions = useMemo(
    () =>
      (vocabulariesQuery.data?.items ?? []).map((item) => ({
        label: item.label_zh || item.value,
        value: item.value,
      })),
    [vocabulariesQuery.data?.items],
  )

  const sampleOptions = useMemo(
    () => [
      { label: '不关联样品', value: '' },
      ...(samplesQuery.data?.items ?? []).map((sample) => ({
        label: sample.sample_code,
        value: sample.id,
      })),
    ],
    [samplesQuery.data?.items],
  )

  const fileRows = useMemo(
    () => filesQuery.data?.items ?? [],
    [filesQuery.data?.items],
  )
  const existingFileMethods = useMemo(
    () =>
      Array.from(
        new Set(fileRows.map((file) => file.method).filter(Boolean)),
      ).sort(),
    [fileRows],
  )

  const methodFilterOptions = useMemo(
    () => [
      { label: '全部', value: '' },
      ...mergeMethodOptions(methodOptions, existingFileMethods),
    ],
    [existingFileMethods, methodOptions],
  )
  const isSetupDiagramUpload = assetRole === 'setup_diagram'

  const sortedRows = useMemo(() => {
    const rows = [...fileRows]
    rows.sort((a, b) => {
      let comparison = 0
      switch (sortKey) {
        case 'original_name':
          comparison = a.original_name.localeCompare(b.original_name)
          break
        case 'method':
          comparison = (a.method ?? '').localeCompare(b.method ?? '')
          break
        case 'file_category':
          comparison = a.file_category.localeCompare(b.file_category)
          break
        case 'size_bytes':
          comparison = a.size_bytes - b.size_bytes
          break
        case 'created_at':
          comparison = a.created_at.localeCompare(b.created_at)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
    return rows
  }, [fileRows, sortKey, sortOrder])

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = sortedRows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  )

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder(key === 'created_at' || key === 'size_bytes' ? 'desc' : 'asc')
    }
  }

  const invalidateFileQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          'experiments',
          'files',
          currentUser?.id ?? 'anonymous',
          experimentId,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: [
          'experiments',
          'audit',
          currentUser?.id ?? 'anonymous',
          experimentId,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: ['samples', 'files'],
      }),
    ])
  }

  const removeSuccessfulUploadSelections = useCallback(
    (successfulIndices: number[]) => {
      const uploadedIndices = new Set(successfulIndices)
      setSelectedFiles((files) =>
        files.filter((_, index) => !uploadedIndices.has(index)),
      )
    },
    [],
  )

  const resetUploadForm = useCallback(() => {
    setMutationMessage(null)
    setSelectedFiles([])
    setUploadMethod('')
    setUploadSampleId('')
    setUploadNote('')
    setFileCategory('raw')
    setAssetRole('characterization_file')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (selectedFiles.length === 0) {
        throw new Error('请选择要上传的文件')
      }

      if (!isSetupDiagramUpload && !uploadMethod.trim()) {
        throw new Error('请先填写文件方法')
      }

      abortRef.current = false
      setBatchProgress({ done: 0, total: selectedFiles.length })

      const successfulIndices: number[] = []
      const errors: string[] = []

      for (const [index, file] of selectedFiles.entries()) {
        if (abortRef.current) {
          throw new UploadCanceledError(successfulIndices, selectedFiles.length)
        }

        const abortController = new AbortController()
        uploadAbortControllerRef.current = abortController

        try {
          await uploadExperimentFile(session.accessToken!, experimentId, {
            file,
            fileCategory,
            method: isSetupDiagramUpload ? undefined : uploadMethod.trim(),
            assetRole,
            note: uploadNote.trim() || undefined,
            sampleId: isSetupDiagramUpload ? null : uploadSampleId || null,
            signal: abortController.signal,
          })
        } catch (error) {
          if (abortRef.current || isAbortError(error)) {
            throw new UploadCanceledError(
              successfulIndices,
              selectedFiles.length,
            )
          }

          errors.push(`${file.name}: ${resolveErrorMessage(error, '上传失败')}`)
          continue
        } finally {
          if (uploadAbortControllerRef.current === abortController) {
            uploadAbortControllerRef.current = null
          }
        }

        successfulIndices.push(index)
        setBatchProgress({
          done: successfulIndices.length,
          total: selectedFiles.length,
        })
      }

      if (errors.length > 0) {
        throw new UploadPartialFailureError(errors.join('\n'), successfulIndices)
      }
    },
    onSuccess: async () => {
      toast.success('文件上传成功')
      resetUploadForm()
      await invalidateFileQueries()
    },
    onError: async (error) => {
      if (isUploadPartialFailureError(error)) {
        removeSuccessfulUploadSelections(error.successfulIndices)
        setMutationMessage(error.message)
        await invalidateFileQueries()
        return
      }

      if (isUploadCanceledError(error)) {
        removeSuccessfulUploadSelections(error.successfulIndices)
        setMutationMessage(error.message)
        toast.warning('文件上传已取消')
        await invalidateFileQueries()
        return
      }

      await invalidateFileQueries()
    },
    onSettled: () => {
      abortRef.current = false
      uploadAbortControllerRef.current = null
      setBatchProgress(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      deleteExperimentFile(session.accessToken!, fileId),
    onSuccess: async () => {
      toast.success('文件已删除')
      setMutationMessage(null)
      await invalidateFileQueries()
    },
    onError: (error) => {
      setMutationMessage(resolveErrorMessage(error, '文件删除失败'))
    },
  })

  const handleDownload = async (file: FileAssetRead) => {
    setMutationMessage(null)
    setDownloadFileId(file.id)

    try {
      const payload = await downloadExperimentFile(
        session.accessToken!,
        file.id,
      )
      triggerBlobDownload(payload.blob, payload.filename || file.original_name)
    } catch (error) {
      setMutationMessage(resolveErrorMessage(error, '文件下载失败'))
    } finally {
      setDownloadFileId(null)
    }
  }

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }
    const incoming = Array.from(files)
    const accepted = incoming.filter((file) => file.size <= MAX_FILE_SIZE)
    const rejected = incoming.filter((file) => file.size > MAX_FILE_SIZE)
    if (rejected.length > 0) {
      toast.error(
        `以下文件超过 50 MB，已跳过：${rejected.map((file) => file.name).join('、')}`,
      )
    }
    if (accepted.length === 0) {
      return
    }
    setSelectedFiles((current) => [...current, ...accepted])
  }

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) => current.filter((_, i) => i !== index))
  }

  const validateUploadForm = () => {
    if (selectedFiles.length === 0) {
      setMutationMessage('请选择要上传的文件')
      return false
    }

    if (!isSetupDiagramUpload && !uploadMethod.trim()) {
      setMutationMessage('请先填写文件方法')
      return false
    }

    return true
  }

  if (experimentQuery.isLoading) {
    return <LoadingState />
  }

  if (experimentQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          actions={
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/experiments' })}
            >
              <ArrowLeft className="size-4" />
              返回列表
            </Button>
          }
          subtitle="无法加载实验文件，请检查网络连接或当前账号权限。"
          title="实验文件"
        />
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(experimentQuery.error, '实验文件页加载失败')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!experimentQuery.data) {
    return (
      <Alert className="border-warning/40 bg-warning-soft [&>svg]:text-warning">
        <AlertDescription className="text-foreground">
          实验文件页暂不可用
        </AlertDescription>
      </Alert>
    )
  }

  const experiment = experimentQuery.data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          <Button
            aria-label="返回实验"
            variant="outline"
            onClick={() =>
              void navigate({
                to: '/experiments/$experimentId',
                params: { experimentId: experiment.id },
              })
            }
          >
            <ArrowLeft className="size-4" />
            返回实验
          </Button>
        }
        subtitle="草稿实验可上传和删除文件；详情页和导出会自动读取最新文件信息。"
        title={`文件管理 · ${experiment.run_code}`}
      />

      {mutationMessage ? (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-wrap">
            {mutationMessage}
          </AlertDescription>
        </Alert>
      ) : null}
      {uploadMutation.isError &&
      !isUploadCanceledError(uploadMutation.error) &&
      !isUploadPartialFailureError(uploadMutation.error) ? (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(uploadMutation.error, '文件上传失败')}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">上传文件</CardTitle>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            当前实验状态 <StatusTag status={experiment.status} />{' '}
            {canManageFiles ? '可直接上传和删除。' : '当前仅允许浏览和下载。'}
          </p>
        </CardHeader>
        <CardContent>
          {canManageFiles ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="editor-field">
                <Label asChild>
                  <span>文件用途</span>
                </Label>
                <div
                  role="radiogroup"
                  aria-label="文件用途"
                  className="inline-flex w-fit rounded-md border border-input bg-background p-0.5"
                >
                  {assetRoleOptions.map((option) => {
                    const active = assetRole === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setAssetRole(option.value)
                          if (option.value === 'setup_diagram') {
                            setUploadMethod('')
                            setUploadSampleId('')
                          }
                        }}
                        className={cn(
                          'rounded-[5px] px-3 py-1.5 text-sm font-medium transition-colors',
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {isSetupDiagramUpload ? null : (
                <div className="editor-field">
                  <Label htmlFor="upload-file-method">文件方法</Label>
                  <Select
                    value={uploadMethod || undefined}
                    onValueChange={setUploadMethod}
                  >
                    <SelectTrigger
                      id="upload-file-method"
                      className="w-full"
                      aria-label="文件方法"
                    >
                      <SelectValue placeholder="例如 Raman / OM / SEM" />
                    </SelectTrigger>
                    <SelectContent>
                      {methodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="editor-field">
                <Label htmlFor="upload-file-category">文件类别</Label>
                <Select value={fileCategory} onValueChange={setFileCategory}>
                  <SelectTrigger
                    id="upload-file-category"
                    className="w-full"
                    aria-label="文件类别"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fileCategoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {isSetupDiagramUpload ? null : (
                <div className="editor-field">
                  <Label htmlFor="upload-sample-id">关联样品</Label>
                  <Select
                    value={uploadSampleId || '__none__'}
                    onValueChange={(value) =>
                      setUploadSampleId(value === '__none__' ? '' : value)
                    }
                  >
                    <SelectTrigger
                      id="upload-sample-id"
                      className="w-full"
                      aria-label="关联样品"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sampleOptions.map((option) => (
                        <SelectItem
                          key={option.value || '__none__'}
                          value={option.value || '__none__'}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="editor-field sm:col-span-2">
                <Label htmlFor="upload-file-note">文件备注</Label>
                <Input
                  id="upload-file-note"
                  autoComplete="off"
                  placeholder="补充描述采集条件或处理说明"
                  value={uploadNote}
                  onChange={(event) => setUploadNote(event.target.value)}
                />
              </div>

              <div className="editor-field sm:col-span-2">
                <Label asChild>
                  <span>选择文件</span>
                </Label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault()
                    setIsDragging(true)
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setIsDragging(false)
                    addFiles(event.dataTransfer.files)
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors',
                    isDragging
                      ? 'border-primary bg-primary-soft'
                      : 'border-input hover:border-primary/50 hover:bg-muted/40',
                  )}
                >
                  <Upload className="size-6 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    点击或拖拽文件到此区域上传
                  </span>
                  <span className="text-xs text-muted-foreground">
                    支持同时选择多个文件，统一填写元数据后批量上传。单个文件不超过
                    50 MB。
                  </span>
                </button>
                <input
                  ref={fileInputRef}
                  id="upload-file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    addFiles(event.target.files)
                  }}
                />
              </div>

              {selectedFiles.length > 0 ? (
                <ul className="flex flex-col gap-1.5 sm:col-span-2">
                  {selectedFiles.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {file.name}
                        <span className="ml-2 text-muted-foreground">
                          {formatBytes(file.size)}
                        </span>
                      </span>
                      {!uploadMutation.isPending ? (
                        <button
                          type="button"
                          aria-label={`移除 ${file.name}`}
                          onClick={() => removeSelectedFile(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-4" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              {batchProgress ? (
                <div className="flex items-center gap-3 sm:col-span-2">
                  <Progress
                    value={Math.round(
                      (batchProgress.done / batchProgress.total) * 100,
                    )}
                    className="flex-1"
                  />
                  <span className="text-sm text-muted-foreground">
                    {batchProgress.done} / {batchProgress.total}
                  </span>
                </div>
              ) : null}

              <div className="flex gap-2 sm:col-span-2">
                <Button
                  aria-label={
                    selectedFiles.length > 1
                      ? `上传 ${selectedFiles.length} 个文件`
                      : '上传文件'
                  }
                  disabled={uploadMutation.isPending}
                  onClick={() => {
                    if (!validateUploadForm()) {
                      return
                    }
                    setMutationMessage(null)
                    uploadMutation.mutate()
                  }}
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Upload className="size-4" />
                  )}
                  {selectedFiles.length > 1
                    ? `上传 ${selectedFiles.length} 个文件`
                    : '上传文件'}
                </Button>
                {uploadMutation.isPending ? (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      abortRef.current = true
                      uploadAbortControllerRef.current?.abort()
                    }}
                  >
                    取消上传
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <Alert className="border-primary/30 bg-primary-soft [&>svg]:text-primary">
              <AlertDescription className="text-foreground">
                当前账号或实验状态不允许修改文件。
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">文件列表</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="editor-field">
              <Label htmlFor="file-method-filter">筛选方法</Label>
              <Select
                value={methodFilter || '__all__'}
                onValueChange={(value) => {
                  setMethodFilter(value === '__all__' ? '' : value)
                  setPage(1)
                }}
              >
                <SelectTrigger
                  id="file-method-filter"
                  className="w-full"
                  aria-label="筛选方法"
                >
                  <SelectValue placeholder="选择方法" />
                </SelectTrigger>
                <SelectContent>
                  {methodFilterOptions.map((option) => (
                    <SelectItem
                      key={option.value || '__all__'}
                      value={option.value || '__all__'}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="editor-field">
              <Label htmlFor="file-category-filter">筛选类别</Label>
              <Select
                value={fileCategoryFilter || '__all__'}
                onValueChange={(value) => {
                  setFileCategoryFilter(value === '__all__' ? '' : value)
                  setPage(1)
                }}
              >
                <SelectTrigger
                  id="file-category-filter"
                  className="w-full"
                  aria-label="筛选类别"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {filterCategoryOptions.map((option) => (
                    <SelectItem
                      key={option.value || '__all__'}
                      value={option.value || '__all__'}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filesQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(filesQuery.error, '文件列表加载失败')}
              </AlertDescription>
            </Alert>
          ) : null}

          {filesQuery.isLoading ? (
            <LoadingState />
          ) : fileRows.length === 0 ? (
            <EmptyState description="当前筛选条件下没有文件记录。可清空筛选或上传新的表征文件。" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead
                        active={sortKey === 'original_name'}
                        order={sortOrder}
                        onClick={() => toggleSort('original_name')}
                      >
                        文件名
                      </SortableHead>
                      <SortableHead
                        active={sortKey === 'method'}
                        order={sortOrder}
                        onClick={() => toggleSort('method')}
                      >
                        方法
                      </SortableHead>
                      <SortableHead
                        active={sortKey === 'file_category'}
                        order={sortOrder}
                        onClick={() => toggleSort('file_category')}
                      >
                        类别
                      </SortableHead>
                      <TableHead>样品</TableHead>
                      <SortableHead
                        active={sortKey === 'size_bytes'}
                        order={sortOrder}
                        onClick={() => toggleSort('size_bytes')}
                      >
                        大小
                      </SortableHead>
                      <SortableHead
                        active={sortKey === 'created_at'}
                        order={sortOrder}
                        onClick={() => toggleSort('created_at')}
                      >
                        上传时间
                      </SortableHead>
                      <TableHead>备注</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((file) => (
                      <TableRow key={file.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">
                              {file.original_name}
                            </span>
                            {file.metadata_json.duplicate_in_experiment ? (
                              <Badge className="w-fit bg-warning-soft text-warning">
                                实验内重复
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{file.method || '-'}</TableCell>
                        <TableCell>
                          {formatFileCategory(file.file_category)}
                        </TableCell>
                        <TableCell>
                          {file.sample_id ? (
                            <Button
                              variant="link"
                              className="h-auto px-0"
                              aria-label={`查看样品 ${sampleCodeById.get(file.sample_id) || file.sample_id}`}
                              onClick={() =>
                                void navigate({
                                  to: '/samples/$sampleId',
                                  params: { sampleId: file.sample_id! },
                                })
                              }
                            >
                              {sampleCodeById.get(file.sample_id) ||
                                file.sample_id}
                            </Button>
                          ) : (
                            '未关联'
                          )}
                        </TableCell>
                        <TableCell>{formatBytes(file.size_bytes)}</TableCell>
                        <TableCell>
                          {dayjs(file.created_at).format('YYYY-MM-DD HH:mm')}
                        </TableCell>
                        <TableCell>{file.note || '无'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label={`下载 ${file.original_name}`}
                              disabled={downloadFileId === file.id}
                              onClick={() => void handleDownload(file)}
                            >
                              {downloadFileId === file.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Download className="size-4" />
                              )}
                              下载
                            </Button>
                            {canManageFiles ? (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`删除 ${file.original_name}`}
                                className="text-destructive hover:text-destructive"
                                disabled={
                                  deleteMutation.isPending &&
                                  deleteMutation.variables === file.id
                                }
                                onClick={() => setFileToDelete(file)}
                              >
                                删除
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {sortedRows.length > PAGE_SIZE ? (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    共 {sortedRows.length} 条 · 第 {safePage}/{totalPages} 页
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={fileToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setFileToDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除确认</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除文件 {fileToDelete?.original_name}？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (fileToDelete) {
                  setMutationMessage(null)
                  deleteMutation.mutate(fileToDelete.id)
                  setFileToDelete(null)
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SortableHead({
  active,
  children,
  onClick,
  order,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
  order: 'asc' | 'desc'
}) {
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          active ? 'text-foreground' : '',
        )}
      >
        {children}
        <ArrowUpDown
          className={cn(
            'size-3.5',
            active ? 'text-primary' : 'text-muted-foreground/50',
          )}
        />
        {active ? (
          <span className="sr-only">
            {order === 'asc' ? '升序' : '降序'}
          </span>
        ) : null}
      </button>
    </TableHead>
  )
}
