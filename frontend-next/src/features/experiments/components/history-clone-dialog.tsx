import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'

import { resolveErrorMessage } from '@/shared/api/http-error'
import type { ExperimentRead, ExperimentStatus } from '@/shared/types/api'
import { EmptyState } from '@/shared/ui/empty-state'
import { StatusTag } from '@/shared/ui/status-tag'
import { cloneExperiment, listExperiments } from '../api'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type HistoryCloneDialogProps = {
  accessToken: string
  currentUserId: string
  onCancel: () => void
  onCloned: (experiment: ExperimentRead) => void
  open: boolean
}

type HistoryFilters = {
  materialSystem: string
  mine: boolean
  page: number
  pageSize: number
  q: string
  status: ExperimentStatus[]
}

const defaultFilters: HistoryFilters = {
  materialSystem: '',
  mine: false,
  page: 1,
  pageSize: 5,
  q: '',
  status: ['locked'],
}

function normalizeHistoryStatus(
  status: ExperimentStatus[],
  mine: boolean,
): ExperimentStatus[] {
  const allowedStatuses = mine
    ? status
    : status.filter((value) => value !== 'submitted')
  return allowedStatuses.length > 0
    ? allowedStatuses
    : (['locked'] as ExperimentStatus[])
}

export function HistoryCloneDialog({
  accessToken,
  currentUserId,
  onCancel,
  onCloned,
  open,
}: HistoryCloneDialogProps) {
  const [draftFilters, setDraftFilters] =
    useState<HistoryFilters>(defaultFilters)
  const [filters, setFilters] = useState<HistoryFilters>(defaultFilters)
  const [actionError, setActionError] = useState<string | null>(null)
  const [activeCloneId, setActiveCloneId] = useState<string | null>(null)

  const experimentsQuery = useQuery({
    queryKey: ['experiments', 'history-clone', currentUserId, filters],
    queryFn: () =>
      listExperiments(accessToken, {
        mine: filters.mine,
        status: filters.status,
        materialSystem: filters.materialSystem || null,
        q: filters.q || null,
        page: filters.page,
        pageSize: filters.pageSize,
      }),
    enabled: open,
  })

  const cloneMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      setActiveCloneId(experimentId)
      return cloneExperiment(accessToken, experimentId)
    },
    onSuccess: (experiment) => {
      setActionError(null)
      toast.success('实验复制成功')
      onCloned(experiment)
    },
    onError: (error) => {
      setActionError(resolveErrorMessage(error, '复制历史实验失败'))
    },
    onSettled: () => {
      setActiveCloneId(null)
    },
  })

  const submittedEnabled = draftFilters.mine

  const applyFilters = () => {
    const normalizedStatus = normalizeHistoryStatus(
      draftFilters.status,
      draftFilters.mine,
    )
    setFilters({
      ...draftFilters,
      materialSystem: draftFilters.materialSystem.trim(),
      page: 1,
      q: draftFilters.q.trim(),
      status: normalizedStatus,
    })
    setDraftFilters((current) => ({
      ...current,
      status: normalizedStatus,
    }))
  }

  const resetFilters = () => {
    setDraftFilters(defaultFilters)
    setFilters(defaultFilters)
    setActionError(null)
  }

  const toggleStatus = (status: ExperimentStatus, checked: boolean) => {
    setDraftFilters((current) => {
      const nextStatus = checked
        ? [...new Set([...current.status, status])]
        : current.status.filter((value) => value !== status)
      return {
        ...current,
        status: normalizeHistoryStatus(nextStatus, current.mine),
      }
    })
  }

  const items = experimentsQuery.data?.items ?? []
  const total = experimentsQuery.data?.total ?? 0
  const page = experimentsQuery.data?.page ?? filters.page
  const pageSize = experimentsQuery.data?.page_size ?? filters.pageSize
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const goToPage = (nextPage: number) => {
    setDraftFilters((current) => ({ ...current, page: nextPage }))
    setFilters((current) => ({ ...current, page: nextPage }))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel()
      }}
    >
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>从历史实验复制</DialogTitle>
          <DialogDescription>
            可复制范围与后端权限一致：自己的已提交/已锁定实验，以及其他人已锁定实验。
            已提交实验仅在“只看我的实验”开启时可检索。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto pt-2">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="历史实验搜索"
              autoComplete="off"
              className="w-64"
              placeholder="搜索实验编号、材料体系或目标"
              value={draftFilters.q}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  q: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters()
              }}
            />
            <Input
              aria-label="历史实验材料体系"
              autoComplete="off"
              className="w-44"
              placeholder="材料体系筛选"
              value={draftFilters.materialSystem}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  materialSystem: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters()
              }}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draftFilters.mine}
                onCheckedChange={(checked) => {
                  const nextMine = checked === true
                  setDraftFilters((current) => ({
                    ...current,
                    mine: nextMine,
                    status: normalizeHistoryStatus(current.status, nextMine),
                  }))
                }}
              />
              只看我的实验
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draftFilters.status.includes('submitted')}
                disabled={!submittedEnabled}
                onCheckedChange={(checked) =>
                  toggleStatus('submitted', checked === true)
                }
              />
              已提交
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draftFilters.status.includes('locked')}
                onCheckedChange={(checked) =>
                  toggleStatus('locked', checked === true)
                }
              />
              已锁定
            </label>
            <Button type="button" size="sm" onClick={applyFilters}>
              应用筛选
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetFilters}
            >
              重置
            </Button>
          </div>

          {actionError ? (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          ) : null}
          {experimentsQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                {resolveErrorMessage(
                  experimentsQuery.error,
                  '历史实验加载失败',
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>实验编号</TableHead>
                  <TableHead>材料体系</TableHead>
                  <TableHead>实验日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {experimentsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24">
                      <EmptyState description="当前筛选条件下没有可复制的历史实验。" />
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{record.run_code}</span>
                          {record.derived_from_run_code ? (
                            <Badge className="w-fit bg-primary-soft text-primary">
                              派生自 {record.derived_from_run_code}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {record.material_system || (
                          <span className="text-muted-foreground">未填写</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {dayjs(record.experiment_date).format('YYYY-MM-DD')}
                      </TableCell>
                      <TableCell>
                        <StatusTag status={record.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          disabled={activeCloneId === record.id}
                          onClick={() => {
                            setActionError(null)
                            cloneMutation.mutate(record.id)
                          }}
                        >
                          {activeCloneId === record.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          复制这条
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {total > 0 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                共 {total} 条 · 第 {page}/{totalPages} 页
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >
                  上一页
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
