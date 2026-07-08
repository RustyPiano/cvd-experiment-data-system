// v2 实验列表页（导航落地页）：列出 cvd_v2 炉次，支持新建 / 进入编辑。
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'

import { resolveErrorMessage } from '@/shared/api/http-error'
import { EmptyState } from '@/shared/ui/empty-state'
import { LoadingState } from '@/shared/ui/loading-state'
import { PageHeader } from '@/shared/ui/page-header'
import { useAuth } from '@/features/auth/use-auth'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
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

export function ExperimentV2ListPage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const token = session.accessToken || ''

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['v2-experiment-list', token],
    queryFn: () => listRuns(token),
    enabled: session.isAuthenticated && !!token,
  })
  const runs = data?.items ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('experimentsV2.list.title')}
        subtitle={t('experimentsV2.list.subtitle')}
        actions={
          <Button asChild>
            <Link to="/experiments-v2/new">
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
                      <TableCell>{run.status}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link
                            to="/experiments-v2/$runId/edit"
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
