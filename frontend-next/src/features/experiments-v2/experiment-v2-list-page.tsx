import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { Download, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useAuth } from '@/features/auth/use-auth'
import { resolveErrorMessage } from '@/shared/api/http-error'
import { triggerBlobDownload } from '@/shared/lib/download'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { downloadRunsExport, listRuns } from './api'
import type { RunFilters, V2ExperimentRead } from './api'
import { statusBadgeVariant, statusLabelKey } from './status-logic'

type FilterDraft = {
  query: string
  materialSystem: string
  operator: string
  dateFrom: string
  dateTo: string
  status: V2ExperimentRead['status'] | 'all'
}

const EMPTY_FILTERS: FilterDraft = {
  query: '',
  materialSystem: '',
  operator: '',
  dateFrom: '',
  dateTo: '',
  status: 'all',
}

function toRunFilters(draft: FilterDraft): RunFilters {
  return {
    query: draft.query,
    materialSystem: draft.materialSystem,
    operator: draft.operator,
    dateFrom: draft.dateFrom,
    dateTo: draft.dateTo,
    statuses: draft.status === 'all' ? [] : [draft.status],
  }
}

export function ExperimentV2ListPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS)
  const [filters, setFilters] = useState<RunFilters>({})
  const pageSize = 50

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['v2-experiment-list', token, page, filters],
    queryFn: () => listRuns(token, { page, pageSize, filters }),
    enabled: session.isAuthenticated && !!token,
  })
  const exportMutation = useMutation({
    mutationFn: () => downloadRunsExport(filters, token),
    onSuccess: ({ blob, filename }) => {
      triggerBlobDownload(blob, filename ?? 'cvd-runs.zip')
      toast.success(t('experimentsV2.list.exportSuccess'))
    },
    onError: (downloadError) =>
      toast.error(
        resolveErrorMessage(downloadError, t('experimentsV2.list.exportError')),
      ),
  })
  const runs = data?.items ?? []
  const total = data?.total ?? 0
  const hasNext = page * pageSize < total
  const isFiltered = Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : Boolean(value),
  )

  const applyFilters = () => {
    setPage(1)
    setFilters(toRunFilters(draft))
  }
  const clearFilters = () => {
    setDraft(EMPTY_FILTERS)
    setPage(1)
    setFilters({})
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('experimentsV2.list.title')}
        subtitle={t('experimentsV2.list.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              <Download className="size-4" />
              {t('experimentsV2.list.export')}
            </Button>
            <Button asChild>
              <Link to="/experiments/new">
                <Plus className="size-4" />
                {t('experimentsV2.list.create')}
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="grid gap-2 xl:col-span-2">
            <Label htmlFor="run-query">
              {t('experimentsV2.list.filters.query')}
            </Label>
            <Input
              id="run-query"
              value={draft.query}
              placeholder={t('experimentsV2.list.filters.queryPlaceholder')}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyFilters()
              }}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="material-system-filter">
              {t('experimentsV2.list.filters.material')}
            </Label>
            <Input
              id="material-system-filter"
              value={draft.materialSystem}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  materialSystem: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="operator-filter">
              {t('experimentsV2.list.filters.operator')}
            </Label>
            <Input
              id="operator-filter"
              value={draft.operator}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  operator: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="status-filter">
              {t('experimentsV2.list.filters.status')}
            </Label>
            <Select
              value={draft.status}
              onValueChange={(status: FilterDraft['status']) =>
                setDraft((current) => ({ ...current, status }))
              }
            >
              <SelectTrigger id="status-filter" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('experimentsV2.list.filters.allStatuses')}
                </SelectItem>
                {(['draft', 'locked', 'invalid'] as const).map((status) => (
                  <SelectItem key={status} value={status}>
                    {t(statusLabelKey(status))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={applyFilters}>
              <Search className="size-4" />
              {t('experimentsV2.list.filters.apply')}
            </Button>
            <Button type="button" variant="outline" onClick={clearFilters}>
              <X className="size-4" />
              {t('experimentsV2.list.filters.clear')}
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="date-from-filter">
              {t('experimentsV2.list.filters.dateFrom')}
            </Label>
            <Input
              id="date-from-filter"
              type="date"
              value={draft.dateFrom}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateFrom: event.target.value,
                }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="date-to-filter">
              {t('experimentsV2.list.filters.dateTo')}
            </Label>
            <Input
              id="date-to-filter"
              type="date"
              value={draft.dateTo}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  dateTo: event.target.value,
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {resolveErrorMessage(error, t('experimentsV2.list.loadError'))}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardContent>
          {isLoading ? (
            <LoadingState />
          ) : runs.length === 0 ? (
            <EmptyState
              description={t(
                isFiltered
                  ? 'experimentsV2.list.filteredEmpty'
                  : 'experimentsV2.list.empty',
              )}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('experimentsV2.list.columns.runCode')}
                    </TableHead>
                    <TableHead>
                      {t('experimentsV2.list.columns.materialSystem')}
                    </TableHead>
                    <TableHead>
                      {t('experimentsV2.list.columns.operator')}
                    </TableHead>
                    <TableHead>
                      {t('experimentsV2.list.columns.date')}
                    </TableHead>
                    <TableHead>
                      {t('experimentsV2.list.columns.status')}
                    </TableHead>
                    <TableHead>
                      {t('experimentsV2.list.columns.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">
                        {run.run_code}
                      </TableCell>
                      <TableCell>{run.material_system || '—'}</TableCell>
                      <TableCell>{run.operator || '—'}</TableCell>
                      <TableCell>
                        {dayjs(run.experiment_date).format('YYYY-MM-DD')}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant={statusBadgeVariant(run.status)}>
                            {t(statusLabelKey(run.status))}
                          </Badge>
                          {run.result_missing_todo ? (
                            <Badge variant="destructive">
                              {t('experimentsV2.status.resultMissing')}
                            </Badge>
                          ) : null}
                          {run.not_characterized_at ? (
                            <Badge variant="outline">
                              {t('experimentsV2.status.notCharacterized')}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            to="/experiments/$runId/edit"
                            params={{ runId: run.id }}
                          >
                            {t('experimentsV2.list.edit')}
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">
                  {t('experimentsV2.list.total', { total })} ·{' '}
                  {t('experimentsV2.list.page', { page })}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page === 1 || isLoading}
                    onClick={() => setPage((current) => current - 1)}
                  >
                    {t('experimentsV2.list.previous')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasNext || isLoading}
                    onClick={() => setPage((current) => current + 1)}
                  >
                    {t('experimentsV2.list.next')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
