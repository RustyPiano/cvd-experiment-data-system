import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'

import { listSamples } from './api'
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { PageHeader } from '@/shared/ui/page-header'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const roleLabels: Record<string, string> = {
  top: '上基底',
  bottom: '下基底',
  product: '产物',
  control: '对照',
}

const roleFilters = [
  { value: '', label: '全部' },
  { value: 'top', label: '上基底' },
  { value: 'bottom', label: '下基底' },
  { value: 'product', label: '产物' },
  { value: 'control', label: '对照' },
]

export function SampleListPage() {
  const { session } = useAuth()
  const [roleFilter, setRoleFilter] = useState('')
  const [query, setQuery] = useState('')

  const samplesQuery = useQuery({
    queryKey: ['samples', 'list', session.currentUser?.id ?? 'anonymous', roleFilter],
    queryFn: () => listSamples(session.accessToken!, roleFilter || null),
    enabled: session.isAuthenticated,
  })

  const items = samplesQuery.data?.items ?? []

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((sample) =>
      [sample.sample_code, sample.run_code, sample.material_system]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle)),
    )
  }, [items, query])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="样品"
        subtitle="查看全部可见样品及其所属实验、角色与存放位置。"
      />

      {samplesQuery.isError && (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(samplesQuery.error, '样品列表加载失败')}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              autoComplete="off"
              placeholder="搜索样品编号 / 实验编号 / 材料体系"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-72"
              aria-label="样品搜索"
            />
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">角色：</span>
              {roleFilters.map((option) => (
                <button
                  key={option.value || 'all'}
                  type="button"
                  onClick={() => setRoleFilter(option.value)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-sm transition-colors',
                    roleFilter === option.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {samplesQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              description={
                items.length === 0
                  ? '还没有样品。样品会在实验的基底/产物中自动生成。'
                  : '没有符合条件的样品。'
              }
            />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>样品编号</TableHead>
                    <TableHead>所属实验</TableHead>
                    <TableHead>材料体系</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>基底类型</TableHead>
                    <TableHead>存放位置</TableHead>
                    <TableHead>更新时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((sample) => (
                    <TableRow key={sample.id}>
                      <TableCell>
                        <Link
                          to="/samples/$sampleId"
                          params={{ sampleId: sample.id }}
                          className="font-medium tabular-nums text-primary hover:underline"
                        >
                          {sample.sample_code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {sample.run_code ? (
                          <Link
                            to="/experiments/$experimentId"
                            params={{ experimentId: sample.experiment_run_id }}
                            className="tabular-nums text-primary hover:underline"
                          >
                            {sample.run_code}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sample.material_system || (
                          <span className="text-muted-foreground text-sm">
                            未填写
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {roleLabels[sample.role] ?? sample.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {sample.substrate_type || (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {sample.storage_location || (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">
                        {dayjs(sample.updated_at).format('YYYY-MM-DD HH:mm')}
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
