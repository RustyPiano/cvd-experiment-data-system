import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate, useSearch, Link } from '@tanstack/react-router'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { ColumnDef } from '@tanstack/react-table'
import dayjs from 'dayjs'
import {
  Plus,
  MoreHorizontal,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileText,
  Clock,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'

import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import { useDebounce } from '@/shared/lib/use-debounce'
import type { ExperimentRead, ExperimentStatus } from '@/shared/types/api'
import { StatusTag, QualityTag } from '@/shared/ui/status-tag'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  cloneExperiment,
  downloadExperimentExcel,
  exportExperimentJson,
  invalidateExperiment,
  listExperiments,
  lockExperiment,
} from './api'
import type { ExperimentSortField } from './api'

// ─── Types ───────────────────────────────────────────────────────────────────

type TransitionAction = 'lock' | 'clone' | 'invalidate'

// ─── Action availability rules (mirrors OLD experiment-state-actions.tsx) ───

function canMutateExperiment(role: string | undefined) {
  return role !== 'viewer' && role !== undefined
}

function isOwnerOrAdmin(
  currentUserId: string | undefined,
  currentUserRole: string | undefined,
  experiment: ExperimentRead,
) {
  return currentUserRole === 'admin' || currentUserId === experiment.owner_id
}

function getActionAvailability(
  experiment: ExperimentRead,
  currentUserId: string | undefined,
  currentUserRole: string | undefined,
) {
  const canMutate = canMutateExperiment(currentUserRole)
  const ownerOrAdmin = isOwnerOrAdmin(
    currentUserId,
    currentUserRole,
    experiment,
  )
  const isOwner = currentUserId === experiment.owner_id

  return {
    canLock: canMutate && ownerOrAdmin && experiment.status === 'submitted',
    canClone:
      canMutate &&
      (experiment.status === 'locked' ||
        (experiment.status === 'submitted' && isOwner)),
    canInvalidate:
      canMutate &&
      ownerOrAdmin &&
      experiment.status !== 'invalid' &&
      experiment.status !== 'locked',
    canEdit: canMutate && experiment.status === 'draft' && ownerOrAdmin,
  }
}

// ─── Sort icon helper ─────────────────────────────────────────────────────────

function SortIcon({
  field,
  currentField,
  currentOrder,
}: {
  field: ExperimentSortField
  currentField: ExperimentSortField | null
  currentOrder: 'asc' | 'desc' | null
}) {
  if (currentField !== field) {
    return <ArrowUpDown className="ml-1 size-3.5 opacity-40" />
  }
  if (currentOrder === 'asc') {
    return <ArrowUp className="ml-1 size-3.5 text-primary" />
  }
  return <ArrowDown className="ml-1 size-3.5 text-primary" />
}

// ─── Table skeleton ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  )
}

// ─── Main page component ──────────────────────────────────────────────────────

export function ExperimentListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { session } = useAuth()

  // TanStack Router search params (typed via validateSearch in route file)
  const search = useSearch({ from: '/_authed/experiments/' })

  const currentUserId = session.currentUser?.id
  const currentUserRole = session.currentUser?.role
  const canCreate = canMutateExperiment(currentUserRole)

  // Local state for UI interactions
  const [listActionError, setListActionError] = useState<string | null>(null)
  const [activeExportKey, setActiveExportKey] = useState<string | null>(null)
  const [activeTransitionKey, setActiveTransitionKey] = useState<string | null>(
    null,
  )
  const activeTransitionRef = useRef<string | null>(null)

  // Local input state (debounced before hitting API)
  const [localQ, setLocalQ] = useState(search.q ?? '')
  const [localMaterialSystem, setLocalMaterialSystem] = useState(
    search.materialSystem ?? '',
  )

  const debouncedQ = useDebounce(localQ, 400)
  const debouncedMaterialSystem = useDebounce(localMaterialSystem, 400)

  // Invalidate dialog state
  const [invalidateTarget, setInvalidateTarget] =
    useState<ExperimentRead | null>(null)
  const [invalidateReason, setInvalidateReason] = useState('')
  const [invalidateValidation, setInvalidateValidation] = useState<
    string | null
  >(null)
  const [invalidateSubmitting, setInvalidateSubmitting] = useState(false)

  // Lock/clone confirmation dialog state
  const [lockTarget, setLockTarget] = useState<ExperimentRead | null>(null)
  const [cloneTarget, setCloneTarget] = useState<ExperimentRead | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  // Derive API filters from URL search + debounced local inputs
  const currentPage = search.page ?? 1
  const currentPageSize = search.pageSize ?? 10
  const currentSortBy = search.sortBy ?? null
  const currentSortOrder = search.sortOrder ?? null
  const currentStatus = search.status ?? []
  const currentMine = search.mine ?? false

  const apiFilters = {
    mine: currentMine,
    status: currentStatus as string[],
    materialSystem: debouncedMaterialSystem.trim() || null,
    q: debouncedQ.trim() || null,
    page: currentPage,
    pageSize: currentPageSize,
    sortBy: currentSortBy,
    sortOrder: currentSortOrder,
  }

  const experimentQuery = useQuery({
    queryKey: ['experiments', 'list', currentUserId ?? 'anonymous', apiFilters],
    queryFn: () => listExperiments(session.accessToken!, apiFilters),
    enabled: session.isAuthenticated,
    placeholderData: keepPreviousData,
  })

  const myDraftsQuery = useQuery({
    queryKey: ['experiments', 'list', currentUserId ?? 'anonymous', { mine: true, status: ['draft'] }],
    queryFn: () => listExperiments(session.accessToken!, { mine: true, status: ['draft'] }),
    enabled: session.isAuthenticated,
  })

  const pendingActionQuery = useQuery({
    queryKey: ['experiments', 'list', currentUserId ?? 'anonymous', { mine: true, status: ['submitted'] }],
    queryFn: () => listExperiments(session.accessToken!, { mine: true, status: ['submitted'] }),
    enabled: session.isAuthenticated,
  })

  const recentEditedQuery = useQuery({
    queryKey: ['experiments', 'list', currentUserId ?? 'anonymous', { sortBy: 'updated_at', sortOrder: 'desc', pageSize: 3 }],
    queryFn: () => listExperiments(session.accessToken!, { sortBy: 'updated_at', sortOrder: 'desc', pageSize: 3 }),
    enabled: session.isAuthenticated,
  })

  // Navigation helpers --------------------------------------------------------

  const updateSearch = (
    updates: Record<string, unknown>,
    options?: { replace?: boolean },
  ) => {
    void navigate({
      to: '/experiments',
      search: (prev) => ({ ...prev, ...updates }),
      resetScroll: false,
      replace: options?.replace,
    })
  }

  const handleSortToggle = (field: ExperimentSortField) => {
    if (currentSortBy !== field) {
      updateSearch({ sortBy: field, sortOrder: 'asc', page: 1 })
    } else if (currentSortOrder === 'asc') {
      updateSearch({ sortBy: field, sortOrder: 'desc', page: 1 })
    } else {
      updateSearch({ sortBy: null, sortOrder: null, page: 1 })
    }
  }

  const handleStatusToggle = (status: ExperimentStatus) => {
    const next = currentStatus.includes(status)
      ? currentStatus.filter((s) => s !== status)
      : [...currentStatus, status]
    updateSearch({ status: next, page: 1 })
  }

  const handleMineToggle = () => {
    updateSearch({ mine: !currentMine, page: 1 })
  }

  const handleResetFilters = () => {
    setLocalQ('')
    setLocalMaterialSystem('')
    void navigate({
      to: '/experiments',
      search: {},
      resetScroll: false,
    })
    setListActionError(null)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in input/textarea/contenteditable
      const activeEl = document.activeElement
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.getAttribute('contenteditable') === 'true')
      ) {
        return
      }

      if ((e.key === 'n' || e.key === 'N') && canCreate) {
        e.preventDefault()
        void navigate({ to: '/experiments/new' })
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        handleResetFilters()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canCreate, navigate])

  // Transition helpers --------------------------------------------------------

  const refreshList = () =>
    queryClient.invalidateQueries({ queryKey: ['experiments'] })

  const runTransition = async (
    experiment: ExperimentRead,
    action: TransitionAction,
    task: () => Promise<void>,
  ): Promise<boolean> => {
    const key = `${experiment.id}:${action}`
    if (activeTransitionRef.current) return false

    activeTransitionRef.current = key
    setActiveTransitionKey(key)
    setListActionError(null)

    try {
      await task()
      await refreshList()
      return true
    } finally {
      activeTransitionRef.current = null
      setActiveTransitionKey(null)
    }
  }

  // Action handlers -----------------------------------------------------------

  const handleLockConfirm = async () => {
    if (!lockTarget) return
    setConfirmBusy(true)
    try {
      const ok = await runTransition(lockTarget, 'lock', async () => {
        await lockExperiment(session.accessToken!, lockTarget.id)
      })
      if (ok) toast.success(`实验 ${lockTarget.run_code} 已锁定`)
    } catch (error) {
      setListActionError(resolveErrorMessage(error, '锁定实验失败'))
    } finally {
      setConfirmBusy(false)
      setLockTarget(null)
    }
  }

  const handleCloneConfirm = async () => {
    if (!cloneTarget) return
    setConfirmBusy(true)
    try {
      let clonedId: string | null = null
      const ok = await runTransition(cloneTarget, 'clone', async () => {
        const cloned = await cloneExperiment(
          session.accessToken!,
          cloneTarget.id,
        )
        clonedId = cloned.id
      })
      if (ok && clonedId) {
        toast.success(`已派生草稿`)
        await navigate({
          to: '/experiments/$experimentId/edit',
          params: { experimentId: clonedId },
        })
      }
    } catch (error) {
      setListActionError(resolveErrorMessage(error, '派生草稿失败'))
    } finally {
      setConfirmBusy(false)
      setCloneTarget(null)
    }
  }

  const handleInvalidateSubmit = async () => {
    if (!invalidateTarget) return
    const normalized = invalidateReason.trim()
    if (!normalized) {
      setInvalidateValidation('请填写作废原因')
      return
    }

    setInvalidateSubmitting(true)
    setInvalidateValidation(null)
    try {
      const ok = await runTransition(
        invalidateTarget,
        'invalidate',
        async () => {
          await invalidateExperiment(
            session.accessToken!,
            invalidateTarget.id,
            {
              reason: normalized,
            },
          )
        },
      )
      if (ok) toast.success(`实验 ${invalidateTarget.run_code} 已作废`)
      setInvalidateTarget(null)
      setInvalidateReason('')
    } catch (error) {
      setListActionError(resolveErrorMessage(error, '作废实验失败'))
    } finally {
      setInvalidateSubmitting(false)
    }
  }

  const handleExportExcel = async (experiment: ExperimentRead) => {
    setActiveExportKey(`${experiment.id}:excel`)
    setListActionError(null)
    try {
      const result = await downloadExperimentExcel(
        session.accessToken!,
        experiment.id,
      )
      triggerBlobDownload(
        result.blob,
        result.filename ?? `${experiment.run_code}.xlsx`,
      )
    } catch (error) {
      toast.error(resolveErrorMessage(error, 'Excel 导出失败'))
    } finally {
      setActiveExportKey(null)
    }
  }

  const handleExportJson = async (experiment: ExperimentRead) => {
    setActiveExportKey(`${experiment.id}:json`)
    setListActionError(null)
    try {
      const payload = await exportExperimentJson(
        session.accessToken!,
        experiment.id,
      )
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      })
      triggerBlobDownload(blob, `${experiment.run_code}-export.json`)
    } catch (error) {
      toast.error(resolveErrorMessage(error, 'JSON 导出失败'))
    } finally {
      setActiveExportKey(null)
    }
  }

  // Table ─────────────────────────────────────────────────────────────────────

  const sortableCol = (field: ExperimentSortField, label: string) => ({
    header: () => (
      <button
        className="flex items-center text-left font-medium hover:text-foreground transition-colors"
        onClick={() => handleSortToggle(field)}
        type="button"
      >
        {label}
        <SortIcon
          field={field}
          currentField={currentSortBy}
          currentOrder={currentSortOrder}
        />
      </button>
    ),
  })

  const columns: ColumnDef<ExperimentRead>[] = [
    {
      accessorKey: 'run_code',
      ...sortableCol('run_code', '实验编号'),
      cell: ({ row }) => (
        <Link
          to="/experiments/$experimentId"
          params={{ experimentId: row.original.id }}
          className="font-medium tabular-nums text-primary hover:underline"
        >
          {row.original.run_code}
        </Link>
      ),
    },
    {
      accessorKey: 'material_system',
      ...sortableCol('material_system', '材料体系'),
      cell: ({ getValue }) => {
        const val = getValue<string | null>()
        return val ? (
          <span>{val}</span>
        ) : (
          <span className="text-muted-foreground text-sm">未填写</span>
        )
      },
    },
    {
      accessorKey: 'quality_label',
      header: '质量标签',
      cell: ({ getValue }) => (
        <QualityTag label={getValue<ExperimentRead['quality_label']>()} />
      ),
    },
    {
      accessorKey: 'experiment_date',
      ...sortableCol('experiment_date', '实验日期'),
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm">
          {dayjs(getValue<string>()).format('YYYY-MM-DD')}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      ...sortableCol('status', '状态'),
      cell: ({ getValue }) => (
        <StatusTag status={getValue<ExperimentStatus>()} />
      ),
    },
    {
      accessorKey: 'updated_at',
      ...sortableCol('updated_at', '更新时间'),
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm text-muted-foreground">
          {dayjs(getValue<string>()).format('YYYY-MM-DD HH:mm')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const experiment = row.original
        const availability = getActionAvailability(
          experiment,
          currentUserId,
          currentUserRole,
        )
        const isBusy =
          activeTransitionKey?.startsWith(`${experiment.id}:`) ?? false
        const isExporting =
          activeExportKey?.startsWith(`${experiment.id}:`) ?? false

        const primaryLabel = availability.canEdit ? '继续填写' : '查看'
        const primaryTo = availability.canEdit
          ? ('/experiments/$experimentId/edit' as const)
          : ('/experiments/$experimentId' as const)

        return (
          <div className="flex items-center gap-1.5">
            <Button variant="default" size="sm" disabled={isBusy} asChild>
              <Link to={primaryTo} params={{ experimentId: experiment.id }}>
                {primaryLabel}
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBusy || isExporting}
                  aria-label={`更多操作 ${experiment.run_code}`}
                  className="size-8 p-0"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() =>
                    navigate({
                      to: '/experiments/$experimentId',
                      params: { experimentId: experiment.id },
                    })
                  }
                >
                  查看详情
                </DropdownMenuItem>
                {availability.canEdit && (
                  <DropdownMenuItem
                    onClick={() =>
                      navigate({
                        to: '/experiments/$experimentId/edit',
                        params: { experimentId: experiment.id },
                      })
                    }
                  >
                    编辑
                  </DropdownMenuItem>
                )}
                {availability.canLock && (
                  <DropdownMenuItem onClick={() => setLockTarget(experiment)}>
                    锁定
                  </DropdownMenuItem>
                )}
                {availability.canClone && (
                  <DropdownMenuItem onClick={() => setCloneTarget(experiment)}>
                    派生草稿
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void handleExportJson(experiment)}
                  disabled={isExporting}
                >
                  导出 JSON
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => void handleExportExcel(experiment)}
                  disabled={isExporting}
                >
                  导出 Excel
                </DropdownMenuItem>
                {availability.canInvalidate && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        setInvalidateTarget(experiment)
                        setInvalidateReason('')
                        setInvalidateValidation(null)
                      }}
                    >
                      作废实验
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]

  // TanStack Table (sorting is manual / URL-driven, not internal)
  const table = useReactTable({
    data: experimentQuery.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    manualPagination: true,
  })

  const items = experimentQuery.data?.items ?? []
  const total = experimentQuery.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / currentPageSize))

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            实验记录
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理 CVD 实验、样品、表征文件和导出任务。
          </p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link to="/experiments/new">
              <Plus className="mr-1 size-4" />
              新建实验 (N)
            </Link>
          </Button>
        )}
      </div>

      {/* Error alerts */}
      {experimentQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(experimentQuery.error, '实验列表加载失败')}
          </AlertDescription>
        </Alert>
      )}
      {listActionError && (
        <Alert variant="destructive">
          <AlertDescription>{listActionError}</AlertDescription>
        </Alert>
      )}

      {/* KPI Stats Tiles */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* 我的草稿 */}
        <Card className="relative overflow-hidden bg-card/60 backdrop-blur-sm border border-border/50">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground font-medium">我的草稿</span>
              <span className="text-3xl font-bold tracking-tight">
                {myDraftsQuery.isLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  myDraftsQuery.data?.total ?? 0
                )}
              </span>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl border border-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
              <FileText className="size-6" />
            </div>
          </CardContent>
        </Card>

        {/* 待操作 */}
        <Card className="relative overflow-hidden bg-card/60 backdrop-blur-sm border border-border/50">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground font-medium">待操作</span>
              <span className="text-3xl font-bold tracking-tight">
                {pendingActionQuery.isLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  pendingActionQuery.data?.total ?? 0
                )}
              </span>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl border border-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              <Clock className="size-6" />
            </div>
          </CardContent>
        </Card>

        {/* 全部记录 */}
        <Card className="relative overflow-hidden bg-card/60 backdrop-blur-sm border border-border/50">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm text-muted-foreground font-medium">全部记录</span>
              <span className="text-3xl font-bold tracking-tight">
                {experimentQuery.isLoading ? (
                  <Skeleton className="h-9 w-12" />
                ) : (
                  experimentQuery.data?.total ?? 0
                )}
              </span>
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-500 rounded-2xl border border-indigo-500/10 shadow-[0_0_15px_rgba(99,102,241,0.1)]">
              <Layers className="size-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 最近编辑 */}
      {recentEditedQuery.data?.items && recentEditedQuery.data.items.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground tracking-wide flex items-center gap-1.5">
              <Clock className="size-4 text-primary animate-pulse" />
              最近编辑
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {recentEditedQuery.data.items.map((exp) => (
              <Card
                key={exp.id}
                className="relative overflow-hidden bg-card/40 hover:bg-card/85 transition-all border border-border/40 hover:border-border/80 group"
              >
                <CardContent className="p-4 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <Link
                      to="/experiments/$experimentId"
                      params={{ experimentId: exp.id }}
                      className="font-semibold text-sm text-primary hover:underline group-hover:text-primary/95 transition-colors"
                    >
                      {exp.run_code}
                    </Link>
                    <StatusTag status={exp.status} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground font-medium">材料体系</span>
                    <span className="text-sm font-medium text-foreground truncate">
                      {exp.material_system || <span className="text-muted-foreground/60 text-xs">未填写</span>}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[11px] text-muted-foreground">
                    <span>编辑于 {dayjs(exp.updated_at).format('YYYY-MM-DD HH:mm')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar + table */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <Input
                autoComplete="off"
                placeholder="搜索实验编号、材料体系或目标"
                value={localQ}
                onChange={(e) => {
                  setLocalQ(e.target.value)
                  updateSearch(
                    { q: e.target.value || undefined, page: 1 },
                    { replace: true },
                  )
                }}
                className="w-64"
                aria-label="实验搜索"
              />
              <Input
                autoComplete="off"
                placeholder="材料体系筛选"
                value={localMaterialSystem}
                onChange={(e) => {
                  setLocalMaterialSystem(e.target.value)
                  updateSearch(
                    {
                      materialSystem: e.target.value || undefined,
                      page: 1,
                    },
                    { replace: true },
                  )
                }}
                className="w-44"
                aria-label="材料体系筛选"
              />

              {/* Status checkboxes */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">状态：</span>
                {(
                  [
                    { value: 'draft', label: '草稿' },
                    { value: 'submitted', label: '已提交' },
                    { value: 'locked', label: '已锁定' },
                    { value: 'invalid', label: '已作废' },
                  ] as { value: ExperimentStatus; label: string }[]
                ).map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-1.5 text-sm"
                  >
                    <Checkbox
                      checked={currentStatus.includes(value)}
                      onCheckedChange={() => handleStatusToggle(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>

              {/* Mine toggle */}
              <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox
                  checked={currentMine}
                  onCheckedChange={handleMineToggle}
                />
                我的实验
              </label>

              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                重置 (R)
              </Button>
            </div>

            {/* Record count */}
            <p className="text-sm text-muted-foreground">
              当前共{' '}
              <span className="font-medium text-foreground tabular-nums">
                {total}
              </span>{' '}
              条记录，支持列表内直接导出 JSON / Excel。
            </p>

            {/* Table */}
            {experimentQuery.isLoading ? (
              <TableSkeleton />
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <p className="text-sm">当前没有可见实验记录。</p>
                {(currentStatus.length > 0 ||
                  currentMine ||
                  debouncedQ ||
                  debouncedMaterialSystem) && (
                  <Button
                    variant="link"
                    className="mt-2 text-primary"
                    onClick={handleResetFilters}
                  >
                    清除筛选条件
                  </Button>
                )}
              </div>
            ) : (
              <div
                className={cn(
                  'rounded-md border border-border transition-opacity duration-200',
                  experimentQuery.isPlaceholderData && 'opacity-50 pointer-events-none',
                )}
              >
                <Table>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => (
                          <TableHead key={header.id}>
                            {header.isPlaceholder
                              ? null
                              : typeof header.column.columnDef.header ===
                                  'function'
                                ? header.column.columnDef.header(
                                    header.getContext(),
                                  )
                                : header.column.columnDef.header}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {typeof cell.column.columnDef.cell === 'function'
                              ? cell.column.columnDef.cell(cell.getContext())
                              : cell.renderValue()}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Pagination */}
            {total > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  第 {currentPage} / {totalPages} 页，共 {total} 条
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage <= 1}
                    onClick={() => updateSearch({ page: currentPage - 1 })}
                  >
                    上一页
                  </Button>

                  {/* page number buttons: at most 5 */}
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    const halfWindow = 2
                    const start = Math.max(
                      1,
                      Math.min(currentPage - halfWindow, totalPages - 4),
                    )
                    const pageNum = start + i
                    return (
                      <Button
                        key={pageNum}
                        variant={
                          pageNum === currentPage ? 'default' : 'outline'
                        }
                        size="sm"
                        className="w-8 p-0"
                        onClick={() => updateSearch({ page: pageNum })}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => updateSearch({ page: currentPage + 1 })}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lock confirm dialog */}
      <AlertDialog
        open={Boolean(lockTarget)}
        onOpenChange={(open) => {
          if (!open && !confirmBusy) setLockTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>锁定实验 {lockTarget?.run_code}</AlertDialogTitle>
            <AlertDialogDescription>
              锁定后不可修改，只能派生新实验。此操作会写入审计日志。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBusy}
              onClick={() => void handleLockConfirm()}
            >
              确认锁定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clone confirm dialog */}
      <AlertDialog
        open={Boolean(cloneTarget)}
        onOpenChange={(open) => {
          if (!open && !confirmBusy) setCloneTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              派生实验 {cloneTarget?.run_code}
            </AlertDialogTitle>
            <AlertDialogDescription>
              将派生实验的参数为新草稿，派生成功后跳转到新草稿编辑页。确定继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmBusy}
              onClick={() => void handleCloneConfirm()}
            >
              确认派生
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Invalidate dialog */}
      <Dialog
        open={Boolean(invalidateTarget)}
        onOpenChange={(open) => {
          if (!open && !invalidateSubmitting) {
            setInvalidateTarget(null)
            setInvalidateReason('')
            setInvalidateValidation(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>作废实验 {invalidateTarget?.run_code}</DialogTitle>
            <DialogDescription>请说明作废原因（必填）。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invalidate-reason">作废原因</Label>
              <Textarea
                id="invalidate-reason"
                autoComplete="off"
                placeholder="说明污染、设备异常或其他作废原因"
                rows={3}
                value={invalidateReason}
                disabled={invalidateSubmitting}
                onChange={(e) => {
                  setInvalidateReason(e.target.value)
                  if (invalidateValidation) setInvalidateValidation(null)
                }}
              />
              {invalidateValidation && (
                <p className="text-sm text-destructive">
                  {invalidateValidation}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={invalidateSubmitting}
              onClick={() => {
                setInvalidateTarget(null)
                setInvalidateReason('')
                setInvalidateValidation(null)
              }}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={invalidateSubmitting}
              onClick={() => void handleInvalidateSubmit()}
            >
              确认作废
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
