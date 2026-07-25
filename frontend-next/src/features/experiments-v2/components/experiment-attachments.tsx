import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useAuth } from '@/features/auth/use-auth'
import {
  deleteExperimentFile,
  downloadExperimentFile,
  listExperimentFiles,
  uploadExperimentFile,
} from '@/features/samples/api'
import type { FileAssetRead } from '@/shared/types/api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import { LoadingState } from '@/shared/ui/loading-state'

type AttachmentRole =
  | 'characterization_file'
  | 'direct_observation_file'
  | 'process_event_attachment'
  | 'temperature_timeseries'
const EMPTY_FILES: FileAssetRead[] = []

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KiB`
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function ExperimentAttachments({
  runId,
  role,
  sampleId,
  characterizationRecordId,
  method,
  bindingType,
  bindingId,
  readOnly,
  allowUpload = true,
  includeIds,
  onFilesChange,
  cleanupUncommitted = false,
  saved,
}: {
  runId: string
  role: AttachmentRole
  sampleId?: string
  characterizationRecordId?: string
  method?: string
  bindingType?: 'process_event' | 'process_step'
  bindingId?: string
  readOnly: boolean
  allowUpload?: boolean
  includeIds?: string[]
  onFilesChange?: (files: FileAssetRead[]) => void
  cleanupUncommitted?: boolean
  saved?: boolean
}) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const queryClient = useQueryClient()
  const pendingUploadIds = useRef(new Set<string>())
  const tokenRef = useRef(token)
  tokenRef.current = token
  const queryKey = [
    'experiment-files',
    runId,
    role,
    sampleId ?? '',
    characterizationRecordId ?? '',
    bindingType ?? '',
    bindingId ?? '',
  ]
  const filesQuery = useQuery({
    queryKey,
    queryFn: () =>
      listExperimentFiles(token, {
        experimentId: runId,
        sampleId,
        characterizationRecordId,
        assetRole: role,
        bindingType,
        bindingId,
      }),
    enabled: Boolean(token),
  })
  const listedFiles = filesQuery.data?.items ?? EMPTY_FILES
  const files = includeIds
    ? listedFiles.filter((file) => includeIds.includes(file.id))
    : listedFiles
  const notifiedIds = useRef('')
  useEffect(() => {
    const signature = files.map((file) => file.id).join(',')
    if (signature !== notifiedIds.current) {
      notifiedIds.current = signature
      onFilesChange?.(files)
    }
  }, [files, onFilesChange])
  useEffect(() => {
    if (saved) pendingUploadIds.current.clear()
  }, [saved])
  useEffect(() => {
    if (!cleanupUncommitted) return
    return () => {
      const fileIds = [...pendingUploadIds.current]
      pendingUploadIds.current.clear()
      void Promise.allSettled(
        fileIds.map((fileId) => deleteExperimentFile(tokenRef.current, fileId)),
      )
    }
  }, [
    bindingId,
    bindingType,
    characterizationRecordId,
    cleanupUncommitted,
    role,
    runId,
    sampleId,
  ])

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['v2-run-audit', runId] }),
    ])
  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadExperimentFile(token, runId, {
        file,
        method,
        sampleId,
        characterizationRecordId,
        assetRole: role,
        bindingType,
        bindingId,
      }),
    onSuccess: (uploaded) => {
      if (cleanupUncommitted) pendingUploadIds.current.add(uploaded.id)
      void invalidate()
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(
          error,
          t('experimentsV2.sections.results.attachmentUploadError'),
        ),
      ),
  })
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteExperimentFile(token, fileId),
    onSuccess: (_result, fileId) => {
      pendingUploadIds.current.delete(fileId)
      void invalidate()
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(
          error,
          t('experimentsV2.sections.results.attachmentDeleteError'),
        ),
      ),
  })
  const [downloading, setDownloading] = useState<string | null>(null)

  const download = async (file: FileAssetRead) => {
    setDownloading(file.id)
    try {
      const response = await downloadExperimentFile(token, file.id)
      triggerBlobDownload(
        response.blob,
        response.filename || file.original_name,
      )
    } catch (error) {
      toast.error(
        resolveErrorMessage(
          error,
          t('experimentsV2.sections.results.attachmentDownloadError'),
        ),
      )
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {filesQuery.isLoading ? <LoadingState /> : null}
      {filesQuery.isError ? (
        <div className="flex items-center justify-between gap-2 text-sm text-destructive">
          <span>{t('experimentsV2.sections.results.filesLoadError')}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void filesQuery.refetch()}
          >
            {t('entityLibrary.actions.retry')}
          </Button>
        </div>
      ) : null}
      {files.map((file) => (
        <div
          key={file.id}
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          <span className="min-w-0 flex-1 truncate text-foreground">
            {file.original_name}
          </span>
          <span>{formatBytes(file.size_bytes)}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={downloading === file.id}
            onClick={() => void download(file)}
          >
            <Download />
            {t('experimentsV2.sections.results.downloadAttachment')}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={readOnly || deleteMutation.isPending}
              >
                <Trash2 />
                {t('experimentsV2.sections.results.deleteAttachment')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('experimentsV2.sections.results.deleteAttachmentTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'experimentsV2.sections.results.deleteAttachmentDescription',
                    { filename: file.original_name },
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t('experimentsV2.sections.results.cancelDeleteAttachment')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate(file.id)}
                >
                  {t('experimentsV2.sections.results.confirmDeleteAttachment')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ))}
      {allowUpload ? (
        <Input
          type="file"
          accept={role === 'temperature_timeseries' ? '.csv,.xlsx' : undefined}
          aria-label={t(
            'experimentsV2.sections.results.uploadAttachmentLabel',
            { method: method || role },
          )}
          disabled={readOnly || uploadMutation.isPending}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) uploadMutation.mutate(file)
            event.target.value = ''
          }}
        />
      ) : null}
    </div>
  )
}
