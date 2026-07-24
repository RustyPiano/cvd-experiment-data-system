import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { resolveErrorMessage } from '@/shared/api/http-error'
import {
  entityFileValueFromAsset,
  tryParseEntityFileReference,
} from '@/shared/entity-file-reference'
import { formatFileSize } from '@/shared/file-assets'
import { triggerBlobDownload } from '@/shared/lib/download'
import {
  deleteEntityFile,
  downloadEntityFile,
  getEntityFile,
  uploadEntityFile,
} from './api'
import type { EntityFileAssetRead } from './api'

export function EntityFileControl({
  value,
  initialValue,
  label,
  allowsNote,
  token,
  disabled,
  invalid,
  ariaDescribedBy,
  inputId,
  onChange,
  onPendingFileChange,
  onDraftDirtyChange,
  onUploadPendingChange,
}: {
  value: string
  initialValue: string
  label: string
  allowsNote: boolean
  token: string
  disabled: boolean
  invalid: boolean
  ariaDescribedBy?: string
  inputId: string
  onChange: (value: string) => void
  onPendingFileChange: (file: EntityFileAssetRead | null) => void
  onDraftDirtyChange: (dirty: boolean) => void
  onUploadPendingChange: (pending: boolean) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const noteId = useId()
  const reference = tryParseEntityFileReference(value)
  const initialReference = tryParseEntityFileReference(initialValue)
  const [uploadedFile, setUploadedFile] = useState<EntityFileAssetRead | null>(
    null,
  )
  const [uploadNote, setUploadNote] = useState('')
  const [downloading, setDownloading] = useState(false)

  const fileQuery = useQuery({
    queryKey: ['entity-file', reference?.file_asset_id, token],
    queryFn: () => getEntityFile(token, reference!.file_asset_id),
    enabled: Boolean(token && reference?.file_asset_id),
  })
  const currentFile =
    uploadedFile?.id === reference?.file_asset_id
      ? uploadedFile
      : fileQuery.data
  const originalName =
    currentFile?.original_name ?? reference?.original_name ?? ''
  const sizeBytes = currentFile?.size_bytes ?? reference?.size_bytes
  const unbound = currentFile?.entity_id == null && Boolean(currentFile)

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadEntityFile(token, {
        file,
        note: uploadNote.trim() || undefined,
      }),
    onSuccess: (file) => {
      const nextValue = entityFileValueFromAsset(file)
      setUploadedFile(file)
      queryClient.setQueryData(['entity-file', file.id, token], file)
      onChange(nextValue)
      onPendingFileChange(file)
      setUploadNote('')
      onDraftDirtyChange(false)
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('entityLibrary.form.fileUploadError')),
      ),
    onSettled: () => onUploadPendingChange(false),
  })
  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteEntityFile(token, fileId),
    onSuccess: () => {
      onPendingFileChange(null)
      setUploadedFile(null)
      onChange(initialReference ? initialValue : '')
    },
    onError: (error) =>
      toast.error(
        resolveErrorMessage(error, t('entityLibrary.form.fileDeleteError')),
      ),
  })

  const handleDownload = async () => {
    if (!reference) return
    setDownloading(true)
    try {
      const response = await downloadEntityFile(token, reference.file_asset_id)
      triggerBlobDownload(
        response.blob,
        response.filename || originalName || 'attachment',
      )
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, t('entityLibrary.form.fileDownloadError')),
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-input p-3"
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
    >
      {reference ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate font-medium">
            {originalName ||
              t('entityLibrary.form.fileFallbackName', {
                id: reference.file_asset_id.slice(0, 8),
              })}
          </span>
          {sizeBytes != null ? (
            <span className="text-muted-foreground">
              {formatFileSize(sizeBytes)}
            </span>
          ) : null}
          {fileQuery.isLoading && !currentFile ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label={t('entityLibrary.form.downloadFile', {
              filename: originalName,
            })}
            disabled={downloading || !token}
            onClick={() => void handleDownload()}
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            {t('entityLibrary.form.download')}
          </Button>
          {unbound ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t('entityLibrary.form.deleteFile', {
                filename: originalName,
              })}
              disabled={disabled || deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(reference.file_asset_id)}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {t('entityLibrary.form.deleteUpload')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {fileQuery.isError && reference ? (
        <p className="text-xs text-destructive">
          {t('entityLibrary.form.fileLoadError')}
        </p>
      ) : null}
      {currentFile?.note ? (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">
          {t('entityLibrary.form.fileNoteDisplay', {
            note: currentFile.note,
          })}
        </p>
      ) : null}

      {!unbound ? (
        <>
          {allowsNote ? (
            <div className="flex flex-col gap-1">
              <label htmlFor={noteId} className="text-xs font-medium">
                {t('entityLibrary.form.fileNote', { label })}
              </label>
              <Input
                id={noteId}
                value={uploadNote}
                disabled={disabled || uploadMutation.isPending}
                onChange={(event) => {
                  setUploadNote(event.target.value)
                  onDraftDirtyChange(event.target.value.trim() !== '')
                }}
              />
            </div>
          ) : null}
          <Input
            id={inputId}
            type="file"
            aria-label={t('entityLibrary.form.uploadFile', { label })}
            disabled={
              disabled ||
              !token ||
              uploadMutation.isPending ||
              (Boolean(reference) && fileQuery.isLoading)
            }
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) {
                onUploadPendingChange(true)
                uploadMutation.mutate(file)
              }
              event.target.value = ''
            }}
          />
          {uploadMutation.isPending ? (
            <p className="text-xs text-muted-foreground">
              {t('entityLibrary.form.uploadingFile')}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t('entityLibrary.form.unboundFileHint')}
        </p>
      )}
    </div>
  )
}

export function EntityFileDisplay({
  value,
  token,
}: {
  value: unknown
  token: string
}) {
  const { t } = useTranslation()
  const reference = tryParseEntityFileReference(value)
  const [downloading, setDownloading] = useState(false)
  const fileQuery = useQuery({
    queryKey: ['entity-file', reference?.file_asset_id, token],
    queryFn: () => getEntityFile(token, reference!.file_asset_id),
    enabled: Boolean(token && reference?.file_asset_id),
  })
  if (!reference) {
    return (
      <span className="text-destructive">
        {t('entityLibrary.form.invalidFileReference')}
      </span>
    )
  }
  const file = fileQuery.data
  const originalName = file?.original_name ?? reference.original_name ?? ''
  const sizeBytes = file?.size_bytes ?? reference.size_bytes
  const handleDownload = async () => {
    setDownloading(true)
    try {
      const response = await downloadEntityFile(token, reference.file_asset_id)
      triggerBlobDownload(
        response.blob,
        response.filename || originalName || 'attachment',
      )
    } catch (error) {
      toast.error(
        resolveErrorMessage(error, t('entityLibrary.form.fileDownloadError')),
      )
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-medium">
          {originalName ||
            t('entityLibrary.form.fileFallbackName', {
              id: reference.file_asset_id.slice(0, 8),
            })}
        </span>
        {sizeBytes != null ? (
          <span className="text-muted-foreground">
            {formatFileSize(sizeBytes)}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t('entityLibrary.form.downloadFile', {
            filename: originalName,
          })}
          disabled={downloading || !token}
          onClick={() => void handleDownload()}
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {t('entityLibrary.form.download')}
        </Button>
      </div>
      {fileQuery.isLoading && !originalName ? (
        <span className="text-xs text-muted-foreground">
          {t('states.loading')}
        </span>
      ) : null}
      {fileQuery.isError ? (
        <span className="text-xs text-destructive">
          {t('entityLibrary.form.fileLoadError')}
        </span>
      ) : null}
      {file?.note ? (
        <span className="whitespace-pre-wrap text-xs text-muted-foreground">
          {t('entityLibrary.form.fileNoteDisplay', { note: file.note })}
        </span>
      ) : null}
    </div>
  )
}
