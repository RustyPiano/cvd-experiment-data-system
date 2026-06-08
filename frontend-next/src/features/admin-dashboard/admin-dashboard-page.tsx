import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowUpDown,
  Clock,
  Database,
  FileEdit,
  Lock,
  Ban,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import type {
  DashboardMemberStat,
  DashboardTrendPoint,
} from '@/shared/types/api'
import { useAuth } from '@/features/auth/use-auth'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getDashboardOverview } from './api'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

const roleLabels: Record<DashboardMemberStat['role'], string> = {
  admin: '管理员',
  member: '成员',
  viewer: '查看者',
}

type SortKey =
  | 'name'
  | 'total'
  | 'draft'
  | 'submitted'
  | 'locked'
  | 'invalid'
  | 'last_activity_at'
  | 'stale_draft_count'
  | 'missing_setup_methods'

export function AdminDashboardPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const isAdmin = session.currentUser?.role === 'admin'
  const [sortKey, setSortKey] = useState<SortKey>('total')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const overviewQuery = useQuery({
    queryKey: [
      'admin',
      'dashboard',
      'overview',
      session.currentUser?.id ?? 'anonymous',
    ],
    queryFn: () => getDashboardOverview(session.accessToken!),
    enabled: session.isAuthenticated && isAdmin,
  })

  const members = overviewQuery.data?.members ?? []

  const sortedMembers = useMemo(() => {
    const rows = [...members]
    rows.sort((a, b) => {
      let comparison = 0
      switch (sortKey) {
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        case 'last_activity_at':
          comparison =
            dayjs(a.last_activity_at ?? 0).valueOf() -
            dayjs(b.last_activity_at ?? 0).valueOf()
          break
        default:
          comparison = Number(a[sortKey]) - Number(b[sortKey])
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })
    return rows
  }, [members, sortKey, sortOrder])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortOrder(key === 'name' ? 'asc' : 'desc')
    }
  }

  if (overviewQuery.isLoading) {
    return <LoadingState />
  }

  if (overviewQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          subtitle="查看全员实验记录数量、流程状态、停滞草稿与近期录入趋势。"
          title="数据看板"
        />
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(overviewQuery.error, '管理员数据看板加载失败')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const overview = overviewQuery.data

  const kpis = [
    {
      label: '总记录',
      value: overview?.totals.total ?? 0,
      icon: Database,
      tone: 'text-foreground bg-muted',
    },
    {
      label: '草稿',
      value: overview?.totals.draft ?? 0,
      icon: FileEdit,
      tone: 'text-primary bg-primary-soft',
    },
    {
      label: '待审',
      value: overview?.totals.submitted ?? 0,
      icon: Clock,
      tone: 'text-warning bg-warning-soft',
    },
    {
      label: '已锁定',
      value: overview?.totals.locked ?? 0,
      icon: Lock,
      tone: 'text-success bg-success-soft',
    },
    {
      label: '已作废',
      value: overview?.totals.invalid ?? 0,
      icon: Ban,
      tone: 'text-destructive bg-destructive/10',
    },
    {
      label: '缺 Setup',
      value: overview?.totals.missing_setup_methods ?? 0,
      icon: TriangleAlert,
      tone: 'text-warning bg-warning-soft',
    },
    {
      label: '本周新增',
      value: overview?.totals.this_week_new ?? 0,
      icon: TrendingUp,
      tone: 'text-primary bg-primary-soft',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        subtitle="查看全员实验记录数量、流程状态、停滞草稿与近期录入趋势。"
        title="数据看板"
      />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label}>
              <CardContent className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    kpi.tone,
                  )}
                >
                  <Icon className="size-4.5" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs text-muted-foreground">
                    {kpi.label}
                  </span>
                  <span className="text-xl font-semibold tabular-nums text-foreground">
                    {kpi.value}
                  </span>
                </span>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近 12 周记录趋势</CardTitle>
        </CardHeader>
        <CardContent>
          {overview?.trend.length ? (
            <TrendBars data={overview.trend} />
          ) : (
            <EmptyState description="暂无趋势数据" />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成员记录情况</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <EmptyState description="暂无成员数据" />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHead
                      active={sortKey === 'name'}
                      order={sortOrder}
                      onClick={() => toggleSort('name')}
                    >
                      成员
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'total'}
                      order={sortOrder}
                      onClick={() => toggleSort('total')}
                    >
                      记录数
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'draft'}
                      order={sortOrder}
                      onClick={() => toggleSort('draft')}
                    >
                      草稿
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'submitted'}
                      order={sortOrder}
                      onClick={() => toggleSort('submitted')}
                    >
                      提交
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'locked'}
                      order={sortOrder}
                      onClick={() => toggleSort('locked')}
                    >
                      锁定
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'invalid'}
                      order={sortOrder}
                      onClick={() => toggleSort('invalid')}
                    >
                      作废
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'last_activity_at'}
                      order={sortOrder}
                      onClick={() => toggleSort('last_activity_at')}
                    >
                      最近活动
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'stale_draft_count'}
                      order={sortOrder}
                      onClick={() => toggleSort('stale_draft_count')}
                    >
                      停滞草稿
                    </SortableHead>
                    <SortableHead
                      active={sortKey === 'missing_setup_methods'}
                      order={sortOrder}
                      onClick={() => toggleSort('missing_setup_methods')}
                    >
                      缺 Setup
                    </SortableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMembers.map((member) => (
                    <TableRow
                      key={member.user_id}
                      className="cursor-pointer"
                      onClick={() =>
                        void navigate({
                          to: '/experiments',
                          search: { ownerId: member.user_id },
                        })
                      }
                    >
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{member.name}</span>
                            <Badge variant="secondary">
                              {roleLabels[member.role]}
                            </Badge>
                            {member.is_active ? null : (
                              <Badge variant="outline">已停用</Badge>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {member.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {member.total}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {member.draft}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {member.submitted}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {member.locked}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {member.invalid}
                      </TableCell>
                      <TableCell>
                        {member.last_activity_at ? (
                          dayjs(member.last_activity_at).fromNow()
                        ) : (
                          <span className="text-muted-foreground">暂无</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.stale_draft_count > 0 ? (
                          <Badge className="bg-warning-soft text-warning">
                            停滞 {member.stale_draft_count}
                          </Badge>
                        ) : (
                          <span className="tabular-nums">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {member.missing_setup_methods > 0 ? (
                          <Badge className="bg-destructive/10 text-destructive">
                            缺 {member.missing_setup_methods}
                          </Badge>
                        ) : (
                          <span className="tabular-nums">0</span>
                        )}
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

function TrendBars({ data }: { data: DashboardTrendPoint[] }) {
  const maxCount = Math.max(...data.map((point) => point.count), 1)

  return (
    <div
      aria-label="记录趋势"
      role="img"
      className="flex h-48 items-end gap-2"
    >
      {data.map((point) => {
        const heightPct = Math.max(
          (point.count / maxCount) * 100,
          point.count > 0 ? 8 : 2,
        )
        return (
          <div
            key={point.period}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
          >
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {point.count > 0 ? point.count : ''}
            </span>
            <div className="flex h-full w-full items-end">
              <div
                className="w-full rounded-t-sm bg-primary/80 transition-all"
                style={{ height: `${heightPct}%` }}
                title={`${point.period}: ${point.count}`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {point.period.replace(/^\d{4}-/, '')}
            </span>
          </div>
        )
      })}
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
          <span className="sr-only">{order === 'asc' ? '升序' : '降序'}</span>
        ) : null}
      </button>
    </TableHead>
  )
}
