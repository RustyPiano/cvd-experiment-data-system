import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import {
  getExperimentVersion,
  listExperimentVersions,
  restoreExperimentVersion,
} from '../api'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

function flatten(
  value: unknown,
  prefix: string,
  out: Record<string, string>,
): Record<string, string> {
  if (value === null || value === undefined) {
    out[prefix] = String(value)
    return out
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out[prefix] = '[]'
      return out
    }
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out))
    return out
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length === 0) {
      out[prefix] = '{}'
      return out
    }
    keys.forEach((key) =>
      flatten(record[key], prefix ? `${prefix}.${key}` : key, out),
    )
    return out
  }
  out[prefix] = String(value)
  return out
}

type DiffRow = { path: string; before: string | null; after: string | null }

function diffSnapshots(
  base: Record<string, unknown> | undefined,
  target: Record<string, unknown> | undefined,
): DiffRow[] {
  const flatBase = flatten(base ?? {}, '', {})
  const flatTarget = flatten(target ?? {}, '', {})
  const paths = new Set([...Object.keys(flatBase), ...Object.keys(flatTarget)])
  const rows: DiffRow[] = []
  for (const path of paths) {
    const before = path in flatBase ? flatBase[path] : null
    const after = path in flatTarget ? flatTarget[path] : null
    if (before !== after) {
      rows.push({ path, before, after })
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}

function comparableSnapshot(snapshot: Record<string, unknown> | undefined) {
  if (!snapshot) return undefined
  return {
    experiment: snapshot.experiment,
    modules: snapshot.modules,
  }
}

export function VersionHistoryDialog({
  accessToken,
  currentUserId,
  experimentId,
  isSubmitted,
  isSubmitting,
  onOpenChange,
  onRestored,
  onSaveVersion,
  open,
}: {
  accessToken: string
  currentUserId: string
  experimentId: string
  isSubmitted: boolean
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onRestored: () => void
  onSaveVersion: (changeNote: string) => Promise<boolean>
  open: boolean
}) {
  const queryClient = useQueryClient()
  const [changeNote, setChangeNote] = useState('')
  const [baseNumber, setBaseNumber] = useState<number | null>(null)
  const [targetNumber, setTargetNumber] = useState<number | null>(null)

  const versionsQuery = useQuery({
    queryKey: ['experiments', 'versions', currentUserId, experimentId],
    queryFn: () => listExperimentVersions(accessToken, experimentId),
    enabled: open && Boolean(accessToken),
  })

  const baseVersionQuery = useQuery({
    queryKey: [
      'experiments',
      'version',
      currentUserId,
      experimentId,
      baseNumber,
    ],
    queryFn: () => getExperimentVersion(accessToken, experimentId, baseNumber!),
    enabled: open && baseNumber !== null,
  })
  const targetVersionQuery = useQuery({
    queryKey: [
      'experiments',
      'version',
      currentUserId,
      experimentId,
      targetNumber,
    ],
    queryFn: () =>
      getExperimentVersion(accessToken, experimentId, targetNumber!),
    enabled: open && targetNumber !== null,
  })

  const restoreMutation = useMutation({
    mutationFn: (versionNumber: number) =>
      restoreExperimentVersion(accessToken, experimentId, versionNumber),
    onSuccess: () => {
      toast.success('已回滚到所选版本')
      onOpenChange(false)
      onRestored()
    },
    onError: (error) => {
      toast.error(resolveErrorMessage(error, '回滚失败'))
    },
  })

  const versions = versionsQuery.data?.items ?? []

  const diffRows = useMemo(() => {
    if (baseNumber === null || targetNumber === null) return null
    if (!baseVersionQuery.data || !targetVersionQuery.data) return null
    return diffSnapshots(
      comparableSnapshot(baseVersionQuery.data.snapshot_json),
      comparableSnapshot(targetVersionQuery.data.snapshot_json),
    )
  }, [baseNumber, targetNumber, baseVersionQuery.data, targetVersionQuery.data])

  const handleSaveVersion = async () => {
    const ok = await onSaveVersion(changeNote)
    if (ok) {
      setChangeNote('')
      void queryClient.invalidateQueries({
        queryKey: ['experiments', 'versions', currentUserId, experimentId],
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>版本历史</DialogTitle>
          <DialogDescription>
            每次提交或“存为新版本”都会固化一个不可变快照，可查看、对比与回滚。
          </DialogDescription>
        </DialogHeader>

        {isSubmitted ? (
          <div className="flex flex-col gap-2 rounded-md border p-4">
            <p className="text-sm font-medium">将当前状态存为新版本</p>
            <Textarea
              aria-label="版本备注"
              placeholder="本次修改的说明（可选）"
              value={changeNote}
              onChange={(event) => setChangeNote(event.target.value)}
              rows={2}
            />
            <div>
              <Button
                disabled={isSubmitting}
                onClick={() => void handleSaveVersion()}
              >
                {isSubmitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                存为新版本
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {versionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚无版本记录。</p>
          ) : (
            versions.map((version) => {
              const isBase = baseNumber === version.version_number
              const isTarget = targetNumber === version.version_number
              return (
                <div
                  key={version.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        v{version.version_number}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(version.created_at).toLocaleString()}
                        {version.created_by_name
                          ? ` · ${version.created_by_name}`
                          : ''}
                      </span>
                    </div>
                    {version.change_note ? (
                      <span className="text-sm">{version.change_note}</span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={isBase ? 'default' : 'outline'}
                      onClick={() => setBaseNumber(version.version_number)}
                    >
                      设为基准
                    </Button>
                    <Button
                      size="sm"
                      variant={isTarget ? 'default' : 'outline'}
                      onClick={() => setTargetNumber(version.version_number)}
                    >
                      设为对比
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={restoreMutation.isPending || isSubmitting}
                      onClick={() => {
                        if (
                          window.confirm(
                            `确认将记录回滚到 v${version.version_number}？当前未存为版本的改动将被覆盖。`,
                          )
                        ) {
                          restoreMutation.mutate(version.version_number)
                        }
                      }}
                    >
                      回滚到此版本
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {baseNumber !== null && targetNumber !== null ? (
          <div className="flex flex-col gap-2 rounded-md border p-4">
            <p className="text-sm font-medium">
              对比 v{baseNumber} → v{targetNumber}
            </p>
            {baseVersionQuery.isLoading || targetVersionQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">加载快照…</p>
            ) : diffRows && diffRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                两个版本内容一致。
              </p>
            ) : (
              <div className="flex flex-col gap-1 font-mono text-xs">
                {diffRows?.map((row) => (
                  <div key={row.path} className="border-b py-1">
                    <div className="text-muted-foreground">{row.path}</div>
                    <div className="text-destructive">
                      - {row.before ?? '（无）'}
                    </div>
                    <div className="text-primary">
                      + {row.after ?? '（无）'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
