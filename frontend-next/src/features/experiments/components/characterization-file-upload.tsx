import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import {
  deleteExperimentFile,
  downloadExperimentFile,
  listExperimentFiles,
  uploadExperimentFile,
} from '../api'
import type { FileAssetRead } from '@/shared/types/api'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const MAX_FILE_SIZE = 50 * 1024 * 1024

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Inline characterization-file uploader scoped to a single method, so that
 * files can be attached right where the method is recorded instead of jumping
 * to the separate Files page. Tags every upload with the row's method.
 */
export function CharacterizationFileUpload({
  disabled,
  experimentId,
  method,
}: {
  disabled: boolean
  experimentId: string
  method: string
}) {
  const { session } = useAuth()
  const accessToken = session.accessToken
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const trimmedMethod = method.trim()
  const enabled = Boolean(accessToken && trimmedMethod)

  const filesQuery = useQuery({
    queryKey: ['experiments', 'char-files', experimentId, trimmedMethod],
    queryFn: () =>
      listExperimentFiles(accessToken!, {
        experimentId,
        assetRole: 'characterization_file',
        method: trimmedMethod,
      }),
    enabled,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ['experiments', 'char-files', experimentId, trimmedMethod],
    })
    // Keep the standalone Files page in sync as well.
    void queryClient.invalidateQueries({ queryKey: ['experiments', 'files'] })
  }

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`${file.name} 超过 50MB 上限`)
        }
        await uploadExperimentFile(accessToken!, experimentId, {
          file,
          fileCategory: 'raw',
          method: trimmedMethod,
          assetRole: 'characterization_file',
        })
      }
    },
    onSuccess: () => {
      toast.success('表征文件已上传')
      invalidate()
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, '文件上传失败'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => deleteExperimentFile(accessToken!, fileId),
    onSuccess: () => {
      toast.success('文件已删除')
      invalidate()
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, '文件删除失败'))
    },
  })

  const handleDownload = async (file: FileAssetRead) => {
    try {
      const payload = await downloadExperimentFile(accessToken!, file.id)
      triggerBlobDownload(payload.blob, payload.filename || file.original_name)
    } catch (error) {
      toast.error(resolveErrorMessage(error, '文件下载失败'))
    }
  }

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    uploadMutation.mutate(Array.from(fileList))
  }

  if (!trimmedMethod) {
    return (
      <p className="text-sm text-muted-foreground">
        选择表征方法后即可在此直接上传该方法的文件。
      </p>
    )
  }

  const files = filesQuery.data?.items ?? []
  const uploadDisabled = disabled || uploadMutation.isPending

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-4 text-sm',
          isDragging ? 'border-primary bg-accent/40' : 'border-border',
          uploadDisabled
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-accent/30',
        )}
        onClick={() => {
          if (!uploadDisabled) fileInputRef.current?.click()
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!uploadDisabled) setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          if (!uploadDisabled) handleFiles(event.dataTransfer.files)
        }}
      >
        {uploadMutation.isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          拖拽或点击上传「{trimmedMethod}」文件（≤50MB）
        </span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {files.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-sm"
            >
              <span className="truncate" title={file.original_name}>
                {file.original_name}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatSize(file.size_bytes)}
                </span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDownload(file)}
                >
                  <Download className="size-4" />
                  <span className="sr-only">下载</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={disabled || deleteMutation.isPending}
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteMutation.mutate(file.id)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">删除</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
