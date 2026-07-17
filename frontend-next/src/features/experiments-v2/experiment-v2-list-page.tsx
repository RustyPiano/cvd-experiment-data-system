// v2 实验列表页（导航落地页）：列出 cvd_v2 炉次，支持新建 / 进入编辑。
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listRuns } from './api'
import { statusBadgeVariant, statusLabelKey } from './status-logic'

export function ExperimentV2ListPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''
  const [page, setPage] = useState(1)
  const pageSize = 50

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['v2-experiment-list', token, page],
    queryFn: () => listRuns(token, { page, pageSize }),
    enabled: session.isAuthenticated && !!token,
  })
  const runs = data?.items ?? []
  const total = data?.total ?? 0
  const hasNext = page * pageSize < total

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('experimentsV2.list.title')}
        subtitle={t('experimentsV2.list.subtitle')}
        actions={
          <Button asChild>
            <Link to="/experiments/new">
              <Plus className="size-4" />
              {t('experimentsV2.list.create')}
            </Link>
          </Button>
        }
      />

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
            <EmptyState description={t('experimentsV2.list.empty')} />
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
